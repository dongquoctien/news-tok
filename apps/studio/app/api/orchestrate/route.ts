import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@news-tok/shared/logger'
import { readStoryboard } from '@news-tok/render'
import { extractProjectId, runClaudeCli } from '@/lib/claude-cli'
import {
  findRunningJob,
  newOrchestrateJobId,
  readOrchestrateJob,
  writeOrchestrateJob,
  type OrchestrateJob,
  type OrchestratePhase,
} from '@/lib/orchestrate-jobs'

const log = createLogger('orchestrate')

/**
 * Map MCP tool names → phase + Vietnamese-friendly step label. Drives
 * the home loading checklist. Tools not in the map fall back to a
 * generic "Đang xử lý…" with no phase advance.
 */
const TOOL_TO_PHASE: Record<string, { phase: OrchestratePhase; label: string }> = {
  createProject: { phase: 'starting', label: 'Tạo dự án mới…' },
  extractArticle: { phase: 'extract', label: 'Đang đọc bài báo…' },
  researchProjectAesthetic: { phase: 'research', label: 'Chọn phong cách thị giác…' },
  searchImage: { phase: 'assets', label: 'Tìm ảnh minh hoạ…' },
  searchMusic: { phase: 'assets', label: 'Chọn nhạc nền…' },
  synthesizeVoice: { phase: 'assets', label: 'Tạo giọng đọc…' },
  listVoices: { phase: 'assets', label: 'Tải danh sách giọng…' },
  // updateStoryboard is the LAST tool Claude calls (after every asset is
  // attached), so it advances to a dedicated 'finalize' phase rather than
  // back to 'plan' — otherwise the checklist would visually rewind.
  updateStoryboard: {
    phase: 'finalize',
    label: 'Xây dựng bố cục và điều chỉnh âm thanh…',
  },
  // Captions phase: Claude calls generateSocialCaption to read the
  // template baseline, then rewriteSocialCaptions to persist the
  // rewritten version onto the project.
  generateSocialCaption: {
    phase: 'captions',
    label: 'Đang viết caption và hashtag…',
  },
  rewriteSocialCaptions: {
    phase: 'captions',
    label: 'Đang viết caption và hashtag…',
  },
  renderSegment: { phase: 'render', label: 'Dựng từng đoạn video…' },
  renderProject: { phase: 'render', label: 'Ghép video hoàn chỉnh…' },
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_TOOLS = [
  'mcp__news-tok__createProject',
  'mcp__news-tok__listProjects',
  'mcp__news-tok__getStoryboard',
  'mcp__news-tok__updateStoryboard',
  'mcp__news-tok__extractArticle',
  'mcp__news-tok__searchImage',
  'mcp__news-tok__searchMusic',
  'mcp__news-tok__synthesizeVoice',
  'mcp__news-tok__listVoices',
  'mcp__news-tok__researchProjectAesthetic',
  'mcp__news-tok__generateSocialCaption',
  'mcp__news-tok__rewriteSocialCaptions',
  'mcp__news-tok__renderSegment',
  'mcp__news-tok__renderProject',
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
].join(',')

type StartBody = {
  source: { type: 'url' | 'text' | 'file'; value: string }
  language: 'vi' | 'en'
  aspect: '9:16' | '16:9' | '1:1'
  /** How many style variants to plan: 1 (just A), 2 (A+B), or 3 (A+B+C).
   *  When `skipRender` is true (the home default) this only affects
   *  which `project.variants[]` entries the planner declares — no mp4
   *  is rendered until the user clicks Render in Studio. */
  variants?: 1 | 2 | 3
  /** Cap on total video duration in seconds. Planner aims for the
   *  natural length of the article but never exceeds this. Default 90s. */
  maxDurationSec?: number
  /** Cap on number of segments (intro + body + outro combined). Default 7. */
  maxSegments?: number
  /** When true (the default for home), Claude finishes after
   *  `updateStoryboard` and never calls `renderProject`. The user
   *  lands in Studio with a ready-to-render project, which is much
   *  faster (no ~30-60s ffmpeg pass) and lets them tweak before
   *  committing to a render. */
  skipRender?: boolean
}

// Backend defaults match the "Standard reel" UI preset — the
// home page's recommended default. These are also the values the
// API falls back to when callers omit length/segment fields. Sync
// these with apps/studio/components/home/create-prompt.tsx
// (LENGTH_PRESETS.standard) when changing.
const DEFAULTS = {
  variants: 1 as 1 | 2 | 3,
  maxDurationSec: 45,
  maxSegments: 6,
  skipRender: true,
} as const

// Hard caps on the slider range. The upper bound on duration (90s)
// is YouTube Shorts' limit + Reels/FB cap — past that the UI shows
// a warning, but the API still accepts up to 90 in case the user
// explicitly wants TikTok-only output.
const LIMITS = {
  maxDurationSec: { min: 15, max: 90 },
  maxSegments: { min: 3, max: 12 },
} as const

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function normalizeOptions(body: StartBody) {
  const variants = ([1, 2, 3] as const).includes(body.variants as 1 | 2 | 3)
    ? (body.variants as 1 | 2 | 3)
    : DEFAULTS.variants
  const maxDurationSec = Number.isFinite(body.maxDurationSec)
    ? clamp(
        Math.round(body.maxDurationSec!),
        LIMITS.maxDurationSec.min,
        LIMITS.maxDurationSec.max
      )
    : DEFAULTS.maxDurationSec
  const maxSegments = Number.isFinite(body.maxSegments)
    ? clamp(
        Math.round(body.maxSegments!),
        LIMITS.maxSegments.min,
        LIMITS.maxSegments.max
      )
    : DEFAULTS.maxSegments
  const skipRender =
    typeof body.skipRender === 'boolean' ? body.skipRender : DEFAULTS.skipRender
  return { variants, maxDurationSec, maxSegments, skipRender }
}

function variantPicksToRender(variants: 1 | 2 | 3): string {
  // Render step receives the ids the renderer should produce.
  if (variants === 1) return '["A"]'
  if (variants === 2) return '["A", "B"]'
  return '["A", "B", "C"]'
}

function buildPrompt(body: StartBody): string {
  const { source, language, aspect } = body
  const { variants, maxDurationSec, maxSegments, skipRender } =
    normalizeOptions(body)
  const sourceLine =
    source.type === 'url'
      ? `Source URL: ${source.value}`
      : source.type === 'file'
        ? `Source file path: ${source.value}`
        : `Source text (treat as article body, do not call extractArticle):\n"""\n${source.value}\n"""`

  // Body segment budget = total segments - intro - outro. Floor at 2 so the
  // planner always has room for at least 2 body beats.
  const bodyMin = 2
  const bodyMax = Math.max(bodyMin, maxSegments - 2)
  // Per-beat target seconds. Floor 4 (snappier than that and the
  // narration can't fit a full sentence); ceiling 7 (longer and the
  // Ken Burns motion drags). The formula matches what each LENGTH
  // preset declares in create-prompt.tsx, so the AI gets the same
  // pacing target regardless of preset vs custom slider input.
  const perSegmentTargetSec = Math.max(
    4,
    Math.min(7, Math.round(maxDurationSec / maxSegments))
  )

  return [
    'You are creating a news-tok short-video project. Follow CLAUDE.md exactly.',
    '',
    sourceLine,
    `Language: ${language}`,
    `Aspect: ${aspect}`,
    '',
    'User-picked limits (HARD caps — do not exceed):',
    `- Total video duration: at most ${maxDurationSec}s.`,
    `- Total segments: at most ${maxSegments} (intro + body + outro).`,
    `- Body segments: between ${bodyMin} and ${bodyMax}.`,
    `- Aim for ~${perSegmentTargetSec}s per segment so the total fits.`,
    skipRender
      ? `- Plan ${variants} variant${variants === 1 ? '' : 's'} in the storyboard but DO NOT render — the user will trigger render from Studio later.`
      : `- Render exactly ${variants} variant${variants === 1 ? '' : 's'}.`,
    '',
    'Workflow:',
    '1. Call mcp__news-tok__createProject with the source / language / aspect above.',
    source.type === 'url'
      ? '2. Call mcp__news-tok__extractArticle on the URL. Keep the returned `mediaAssets` array — you will write it into project.library at step 7 so the user sees the article photos in Studio.'
      : '2. Skip extractArticle — use the text provided above as the article body. There are no article images for this run.',
    '3. Call mcp__news-tok__researchProjectAesthetic and use the recommended preset trio (variantPicks) as project.variants. Keep all 3 variants in the storyboard even when rendering fewer — the user can render the rest later.',
    `4. Draft a three-part storyboard (intro + body + outro). Use at most ${maxSegments} segments total. Each segment ~${perSegmentTargetSec}s. Pick the default voice for the language. Do NOT ask the user — this is a headless run.`,
    '5. For each segment, call searchImage + synthesizeVoice in parallel — ALWAYS use searchImage for backgrounds, NEVER use article mediaAssets here. Set segment.durationSec = recommendedSegmentDurationSec. **REQUIRED**: copy the `wordBoundaries` array from each synthesizeVoice result onto the matching `segment.wordBoundaries` field. Without this, karaoke subtitles will not render (the composition only emits subtitles when `segment.wordBoundaries.length > 0`).',
    '6. Call searchMusic using the musicMood from research, set bgMusic.',
    '7. Build the project payload with `library` set to the `mediaAssets` array from step 2 (or `[]` if step 2 was skipped or returned no images). Each segment MUST include `wordBoundaries` from step 5 (subtitles depend on it). updateStoryboard automatically mirrors every segment background into library, so you only need to seed it with the article media here — the stock backgrounds will be added by the sanitiser. Then call updateStoryboard to persist.',
    '8. Generate social captions for the user to paste on TikTok / Facebook / Instagram / YouTube. (a) Call mcp__news-tok__generateSocialCaption to fetch the local template baseline (topic auto-detect + hashtag pool). (b) Rewrite each platform per CLAUDE.md "prep video for social upload" guidance, with HARD upper bounds the rewriteSocialCaptions tool enforces: TikTok ≤250 chars (aim 120-220), Facebook ≤800 (aim 400-700), Instagram ≤500 (aim 250-450), YouTube ≤1500 (aim 1000-1400). Count chars BEFORE calling the tool; shorten any draft over its max first. If the tool rejects with "Caption length exceeds sweet spot", shorten the offending platforms by the chars the error names + 10 buffer, then call again (up to 2 retries). Preserve any masking patterns the baseline applied. Refine hashtags: drop generic / off-topic tags, add event-specific tags from the title (strip Vietnamese diacritics — #vietnam not #việt). (c) Call mcp__news-tok__rewriteSocialCaptions with projectId, topic, captions (4 platforms), hashtags (≤12). On success this persists into project.socialCaptions so Studio shows your version next time the user opens the Caption dialog.',
    skipRender
      ? '9. DO NOT call renderProject. The user will trigger render from Studio when ready. Report the project path and stop.'
      : `9. Call renderProject with variants: ${variantPicksToRender(variants)}.`,
    skipRender ? '10. Done — return the project id and absolute project directory path.' : '10. Report the absolute output path.',
    '',
    'Important: this is non-interactive. Make sensible defaults whenever CLAUDE.md says to ask — never call AskUserQuestion.',
  ].join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StartBody
    if (!body?.source?.value || !body.source.type || !body.language || !body.aspect) {
      return NextResponse.json({ error: 'source, language, aspect required' }, { status: 400 })
    }

    const running = await findRunningJob()
    if (running) {
      return NextResponse.json({ error: 'a job is already running', job: running }, { status: 409 })
    }

    const jobId = newOrchestrateJobId()
    const { skipRender } = normalizeOptions(body)
    const job: OrchestrateJob = {
      jobId,
      status: 'running',
      startedAt: new Date().toISOString(),
      source: body.source,
      language: body.language,
      aspect: body.aspect,
      phase: 'starting',
      step: 'Đang khởi động AI…',
      willRender: !skipRender,
    }
    await writeOrchestrateJob(job)
    void log.info('job start', {
      jobId,
      sourceType: body.source.type,
      language: body.language,
      aspect: body.aspect,
    })

    void runClaude(job, buildPrompt(body)).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err)
      const failed = await readOrchestrateJob(job.jobId)
      await writeOrchestrateJob({
        ...(failed ?? job),
        status: 'failed',
        endedAt: new Date().toISOString(),
        error: message,
      })
      void log.error('job failed', {
        jobId,
        phase: (failed ?? job).phase,
        message,
      })
    })

    return NextResponse.json({ jobId, status: 'running' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const jobId = url.searchParams.get('jobId')
  if (jobId) {
    const job = await readOrchestrateJob(jobId)
    if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 })
    return NextResponse.json(job)
  }
  const running = await findRunningJob()
  return NextResponse.json({ running })
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const jobId = url.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  const job = await readOrchestrateJob(jobId)
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 })
  if (job.status !== 'running') return NextResponse.json(job)
  if (job.pid) {
    try {
      process.kill(job.pid)
    } catch {
      // already gone
    }
  }
  await writeOrchestrateJob({
    ...job,
    status: 'cancelled',
    endedAt: new Date().toISOString(),
  })
  return NextResponse.json({ ...job, status: 'cancelled' })
}

async function runClaude(job: OrchestrateJob, prompt: string): Promise<void> {
  let lastStep = job.step
  let lastPhase: OrchestratePhase | undefined = job.phase
  let projectId: string | undefined

  // Strict checklist order. Used by updateStep to refuse phase regressions
  // (e.g. a late searchImage call after updateStoryboard must NOT pull the
  // UI back to 'assets'). Keep in sync with PHASE_ORDER in
  // components/home/create-prompt.tsx.
  const PHASE_RANK: Record<OrchestratePhase, number> = {
    starting: 0,
    extract: 1,
    'collect-media': 2,
    research: 3,
    plan: 4,
    assets: 5,
    finalize: 6,
    captions: 7,
    render: 8,
    done: 9,
  }

  const updateStep = async (
    step: string,
    phase?: OrchestratePhase
  ): Promise<void> => {
    if (step === lastStep && phase === lastPhase) return
    // Refuse to rewind the checklist. If Claude fires an out-of-order tool
    // call (e.g. another searchImage after updateStoryboard), keep the
    // higher phase but still surface the fresh step text so the user sees
    // activity.
    const nextPhase: OrchestratePhase | undefined =
      phase && lastPhase && PHASE_RANK[phase] < PHASE_RANK[lastPhase]
        ? lastPhase
        : phase
    lastStep = step
    if (nextPhase) lastPhase = nextPhase
    const current = await readOrchestrateJob(job.jobId)
    if (!current || current.status !== 'running') return
    await writeOrchestrateJob({
      ...current,
      step,
      phase: nextPhase ?? current.phase,
      projectId: projectId ?? current.projectId,
    })
  }

  // Buffer of recent stdout lines so projectId detection can scan the
  // raw tool_result string before runClaudeCli unwraps it. We pass an
  // onToolResult that gives us the unwrapped text, but the projectId
  // pattern also appears literally in unwrapped form so a single regex
  // on the unwrapped text catches both shapes.
  const stderrTail = { value: '' }

  let stderrFinal = ''
  try {
    const result = await runClaudeCli({
      prompt,
      allowedTools: ALLOWED_TOOLS,
      onPid: async (pid) => {
        await writeOrchestrateJob({ ...job, pid, step: 'AI đã sẵn sàng…' })
      },
      onToolUse: async ({ name }) => {
        const mapped = TOOL_TO_PHASE[name]
        if (mapped) {
          await updateStep(mapped.label, mapped.phase)
        } else {
          // Unknown MCP tool — keep the user informed without
          // advancing the phase checklist.
          await updateStep('Đang xử lý…')
        }
      },
      onToolResult: async ({ text }) => {
        if (!projectId) {
          // createProject returns `{ projectId, path }` as the tool result
          // text. The regex tolerates both raw and JSON-escaped forms so
          // either stream-json shape is caught.
          const id = extractProjectId(text)
          if (id) {
            projectId = id
            const current = await readOrchestrateJob(job.jobId)
            if (current) await writeOrchestrateJob({ ...current, projectId })
          }
        }
        // extractArticle internally does Readability + image download.
        // Surface the image-collection phase when mediaAssets shows up
        // in the result so the user sees the Library populate live.
        if (text.includes('"mediaAssets"') || text.includes('\\"mediaAssets\\"')) {
          const matches = text.match(/"path"\s*:\s*"/g) ?? []
          const count = matches.length
          await updateStep(
            count > 0
              ? `Đã lấy ${count} ảnh từ bài báo cho Library…`
              : 'Bài báo không có ảnh — bỏ qua bước Library…',
            'collect-media'
          )
        }
      },
    })
    stderrFinal = result.stderr
    stderrTail.value = result.stderr
  } catch (err) {
    stderrFinal = (err instanceof Error ? err.message : String(err)).slice(-500)
    throw err
  }

  const final = await readOrchestrateJob(job.jobId)
  if (final?.status === 'cancelled') {
    void log.warn('job cancelled', { jobId: job.jobId, projectId })
    return
  }

  // A Claude CLI run that exits cleanly with a projectId can still be a
  // partial failure: the subprocess might have called createProject and
  // then bailed out without populating any segments (anti-bot CAPTCHA on
  // the article URL, network wedge between tools, model refusal, …).
  // Probe the storyboard on disk — only treat the job as completed when
  // updateStoryboard actually wrote a non-empty `segments` array,
  // otherwise the user lands on an empty editor and thinks the feature
  // is broken.
  let segmentCount = 0
  let storyboardError: string | undefined
  if (projectId) {
    try {
      const story = await readStoryboard(projectId)
      segmentCount = story.segments.length
    } catch (err) {
      storyboardError = err instanceof Error ? err.message : String(err)
    }
  }
  const success = !!projectId && segmentCount > 0

  let failureReason: string | undefined
  if (!success) {
    if (!projectId) {
      failureReason = 'AI không tạo được project (Claude CLI thoát mà không gọi createProject).'
    } else if (storyboardError) {
      failureReason = `Đã tạo project nhưng không đọc được storyboard: ${storyboardError}`
    } else {
      failureReason =
        'AI tạo project nhưng không có segment nào — có thể bài báo bị chặn (anti-bot/CAPTCHA) hoặc nội dung quá ngắn. Thử dán nội dung dạng text thay vì URL.'
    }
  }

  await writeOrchestrateJob({
    ...(final ?? job),
    status: success ? 'completed' : 'failed',
    endedAt: new Date().toISOString(),
    projectId,
    phase: success ? 'done' : final?.phase,
    step: success ? 'Hoàn tất — đang mở Studio…' : 'Không tạo được video',
    error: success ? undefined : failureReason,
  })
  if (success) {
    void log.info('job completed', {
      jobId: job.jobId,
      projectId,
      segmentCount,
      durationMs: Date.now() - new Date(job.startedAt).getTime(),
    })
  } else {
    void log.error('job ended without usable storyboard', {
      jobId: job.jobId,
      projectId,
      segmentCount,
      lastPhase: final?.phase,
      reason: failureReason,
      stderrTail: stderrFinal.slice(-500),
    })
  }
}
