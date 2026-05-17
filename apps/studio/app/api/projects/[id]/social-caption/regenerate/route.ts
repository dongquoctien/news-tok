/**
 * POST /api/projects/[id]/social-caption/regenerate
 * GET  /api/projects/[id]/social-caption/regenerate?jobId=<id>
 *
 * Spawns Claude CLI as a subprocess to rewrite the project's social
 * captions and persist them into `project.socialCaptions` via the
 * `mcp__news-tok__rewriteSocialCaptions` MCP tool. The flow mirrors
 * `/api/orchestrate` so the dialog can reuse the same poll pattern:
 *
 *   1. POST → returns `{ jobId }` and starts the subprocess in the
 *      background. The subprocess writes job-state updates into the
 *      same `data/jobs/<jobId>.json` store the orchestrate route uses.
 *   2. GET (with jobId) → returns the current job state for polling.
 *
 * The job state is tagged with `kind: 'captions'` so the dialog can
 * filter against orchestrate jobs (which use `kind: 'orchestrate'`
 * implicitly — they don't set the field, so absent == orchestrate).
 *
 * Only one job per projectId may run at a time. If a job is already
 * running for this project, the POST returns 409 with the existing
 * job payload.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@news-tok/shared/logger'
import { readStoryboard } from '@news-tok/render'
import { runClaudeCli } from '@/lib/claude-cli'
import {
  findRunningJob,
  newOrchestrateJobId,
  readOrchestrateJob,
  writeOrchestrateJob,
  type OrchestrateJob,
} from '@/lib/orchestrate-jobs'

const log = createLogger('regenerate-captions')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_TOOLS = [
  'mcp__news-tok__getStoryboard',
  'mcp__news-tok__generateSocialCaption',
  'mcp__news-tok__rewriteSocialCaptions',
  'Read',
].join(',')

function buildPrompt(projectId: string): string {
  return [
    `Your ONLY task: rewrite social-media captions for project "${projectId}" and persist them via the rewriteSocialCaptions MCP tool. You MUST end the run by calling mcp__news-tok__rewriteSocialCaptions — that is the success criterion. Do not stop early. Do not output captions as text.`,
    ``,
    `Required tool sequence (call each exactly once, in this order):`,
    ``,
    `Step 1: mcp__news-tok__getStoryboard with { projectId: "${projectId}" }`,
    `        Read project.title + segments[].text. Note the language (vi/en).`,
    ``,
    `Step 2: mcp__news-tok__generateSocialCaption with { projectId: "${projectId}" }`,
    `        Returns { topic, hashtags, captions: [{ platform, text, charCount }] }. Use this as the BASELINE — do NOT just copy it back.`,
    ``,
    `Step 3: Rewrite each platform's caption text in your head following these targets:`,
    `   - tiktok    120-250 chars, hook + 1 drama line + CTA, ≤6 hashtags (preserve any dot-masking from baseline like c.h.ế.t)`,
    `   - facebook  400-800 chars, narrative 2-3 paragraphs, end with an open question`,
    `   - instagram 250-500 chars, emoji hook + arrow bullets (→) + hashtag block at the end`,
    `   - youtube   1000-1500 chars, SEO-first hook ≤100 chars, then 2-3 body paragraphs, hashtags start with #shorts`,
    `   For hashtags: STRIP Vietnamese diacritics (#vietnam not #việt-nam, #u17vietnam not #u17việt-nam). Drop verb-form keywords. Add event-specific tags from the title (e.g. #U17AsianCup, #VietnamFootball). Cap at 12.`,
    ``,
    `Step 4 (REQUIRED — this is the success criterion): Call mcp__news-tok__rewriteSocialCaptions with:`,
    `  {`,
    `    "projectId": "${projectId}",`,
    `    "topic": <the topic string returned by generateSocialCaption in step 2>,`,
    `    "captions": [`,
    `      { "platform": "tiktok",    "text": "<your rewritten tiktok caption>" },`,
    `      { "platform": "facebook",  "text": "<your rewritten facebook caption>" },`,
    `      { "platform": "instagram", "text": "<your rewritten instagram caption>" },`,
    `      { "platform": "youtube",   "text": "<your rewritten youtube caption>" }`,
    `    ],`,
    `    "hashtags": ["#tag1", "#tag2", ...]`,
    `  }`,
    ``,
    `Stop immediately after step 4 succeeds. Do NOT call any other MCP tool. Do NOT call renderProject. Do NOT call updateStoryboard. Do NOT call AskUserQuestion. If a step fails, retry that step once; do not give up silently.`,
  ].join('\n')
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(params.id)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
    }

    // Prevent two concurrent caption regenerations for the same project
    // — they would race-write `project.socialCaptions`. We don't block on
    // the global orchestrate job (those write different fields), only on
    // sibling caption jobs.
    const running = await findRunningJob()
    if (
      running &&
      running.kind === 'captions' &&
      running.projectId === params.id
    ) {
      return NextResponse.json(
        { error: 'a caption job is already running for this project', job: running },
        { status: 409 }
      )
    }

    const jobId = newOrchestrateJobId()
    const job: OrchestrateJob = {
      jobId,
      kind: 'captions',
      status: 'running',
      startedAt: new Date().toISOString(),
      source: { type: 'text', value: 'regenerate-captions' },
      language: 'vi',
      aspect: '9:16',
      projectId: params.id,
      phase: 'captions',
      step: 'Claude đang viết caption và hashtag…',
      willRender: false,
    }
    await writeOrchestrateJob(job)
    void log.info('caption job start', { jobId, projectId: params.id })

    void runRewrite(job).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err)
      const failed = await readOrchestrateJob(job.jobId)
      await writeOrchestrateJob({
        ...(failed ?? job),
        status: 'failed',
        endedAt: new Date().toISOString(),
        error: message,
      })
      void log.error('caption job failed', { jobId, message })
    })

    return NextResponse.json({ jobId, status: 'running' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params: _params }: { params: { id: string } }) {
  const url = new URL(req.url)
  const jobId = url.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  }
  const job = await readOrchestrateJob(jobId)
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 })
  return NextResponse.json(job)
}

async function runRewrite(job: OrchestrateJob): Promise<void> {
  const projectId = job.projectId!
  const prompt = buildPrompt(projectId)

  // Capture the generatedAt timestamp BEFORE Claude runs so we can
  // verify (post-flight) that the storyboard's socialCaptions got
  // refreshed. This is more reliable than scraping the stream-json
  // tool_result text, which depends on MCP server output formatting.
  let preGeneratedAt: string | undefined
  try {
    const pre = await readStoryboard(projectId)
    preGeneratedAt = pre.socialCaptions?.generatedAt
  } catch {
    // best-effort — if read fails, post-flight check still works as
    // long as Claude writes ANY socialCaptions entry.
  }

  // Track what Claude actually did so an error message can tell the
  // user "Claude called X, Y but never called rewriteSocialCaptions"
  // rather than the opaque current one.
  const toolsCalled: string[] = []

  try {
    const result = await runClaudeCli({
      prompt,
      allowedTools: ALLOWED_TOOLS,
      // 5 min hard timeout — a healthy run is 30-60s. If we're past 5
      // min something is wedged (network, MCP crash) and we should
      // surface that to the user instead of leaving the dialog
      // spinning forever.
      timeoutMs: 5 * 60 * 1000,
      onPid: async (pid) => {
        await writeOrchestrateJob({ ...job, pid, step: 'AI đã sẵn sàng…' })
      },
      onToolUse: async ({ name }) => {
        toolsCalled.push(name)
        const current = await readOrchestrateJob(job.jobId)
        if (!current || current.status !== 'running') return
        // Surface progress without changing phase — there's only one
        // phase here ('captions'), the user just wants to see Claude
        // is doing something.
        const label =
          name === 'rewriteSocialCaptions'
            ? 'Đang lưu caption vào storyboard…'
            : name === 'generateSocialCaption'
              ? 'Đọc baseline caption…'
              : name === 'getStoryboard'
                ? 'Đọc storyboard…'
                : 'Claude đang viết caption và hashtag…'
        await writeOrchestrateJob({ ...current, step: label })
      },
    })

    // Post-flight verify: read the storyboard and check the
    // socialCaptions.generatedAt advanced. This works regardless of
    // how the MCP stream-json wraps tool output.
    let saved = false
    try {
      const post = await readStoryboard(projectId)
      const postGeneratedAt = post.socialCaptions?.generatedAt
      saved =
        !!postGeneratedAt && postGeneratedAt !== preGeneratedAt
    } catch (err) {
      void log.error('post-flight read failed', {
        jobId: job.jobId,
        message: err instanceof Error ? err.message : String(err),
      })
    }

    if (!saved) {
      void log.warn('captions not persisted', {
        jobId: job.jobId,
        toolsCalled,
        stderrTail: result.stderr.slice(-500),
      })
      const calledLabel = toolsCalled.length
        ? `Claude called: ${toolsCalled.join(', ')}.`
        : 'Claude did not call any MCP tool.'
      throw new Error(
        `${calledLabel} rewriteSocialCaptions was not persisted. ${result.stderr ? `stderr tail: ${result.stderr.slice(-300)}` : ''}`
      )
    }
  } catch (err) {
    throw err
  }

  const final = await readOrchestrateJob(job.jobId)
  if (final?.status === 'cancelled') {
    void log.warn('caption job cancelled', { jobId: job.jobId, projectId })
    return
  }
  await writeOrchestrateJob({
    ...(final ?? job),
    status: 'completed',
    endedAt: new Date().toISOString(),
    phase: 'done',
    step: 'Caption đã sẵn sàng.',
  })
  void log.info('caption job completed', {
    jobId: job.jobId,
    projectId,
    durationMs: Date.now() - new Date(job.startedAt).getTime(),
  })
}
