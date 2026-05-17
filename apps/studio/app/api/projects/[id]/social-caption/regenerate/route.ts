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
import { extractProjectId, runClaudeCli } from '@/lib/claude-cli'
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
    `You are rewriting social-media captions for an existing news-tok project.`,
    ``,
    `Project id: ${projectId}`,
    ``,
    `Follow CLAUDE.md exactly — especially the "Common task: prep video for social upload" section.`,
    ``,
    `Workflow:`,
    `1. Call mcp__news-tok__getStoryboard with projectId=${projectId} to read the article title + segment.text + any prior socialCaptions.`,
    `2. Call mcp__news-tok__generateSocialCaption with projectId=${projectId} to fetch the local template baseline (topic auto-detect + topic-aware hashtag pool).`,
    `3. Rewrite each platform's caption per CLAUDE.md guidance:`,
    `   - TikTok: 120–250 chars, hook + 1 drama line + CTA, 6 dot-masked hashtags`,
    `   - Facebook: 400–800 chars, narrative 2–3 paragraphs, ends with an open question`,
    `   - Instagram: 250–500 chars, emoji hook + arrow-bulleted keypoints + hashtag block`,
    `   - YouTube: 1000–1500 chars, SEO-first hook ≤100 chars + body + #shorts-led hashtags`,
    `   Preserve any masking pattern (c.h.ế.t / không còn) that appears in the baseline output for each platform. Refine the hashtag pool: drop generic / off-topic tags, add event-specific tags from the title (e.g. U17 / World Cup / VietnamFootball) while STRIPPING Vietnamese diacritics on tags (#vietnam not #việt-nam).`,
    `4. Call mcp__news-tok__rewriteSocialCaptions with projectId=${projectId}, topic (the one returned by generateSocialCaption), captions = [{platform, text}, ...] for all 4 platforms, hashtags = [the refined union, capped at 12]. The tool persists this into project.socialCaptions and Studio's caption dialog reads it on next open.`,
    `5. Done. Do NOT call any other tool. Do NOT render the project.`,
    ``,
    `Important: this is non-interactive. Make sensible defaults — never call AskUserQuestion.`,
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

  let saved = false
  try {
    const result = await runClaudeCli({
      prompt,
      allowedTools: ALLOWED_TOOLS,
      onPid: async (pid) => {
        await writeOrchestrateJob({ ...job, pid, step: 'AI đã sẵn sàng…' })
      },
      onToolUse: async ({ name }) => {
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
      onToolResult: async ({ text }) => {
        // The rewriteSocialCaptions tool returns { projectId, captionsCount, ... }.
        // Treat its success as the signal that we've persisted captions.
        if (text.includes('captionsCount') && extractProjectId(text) === projectId) {
          saved = true
        }
      },
    })
    if (!saved) {
      throw new Error(
        `Claude finished without calling rewriteSocialCaptions. stderr tail: ${result.stderr.slice(-300)}`
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
