import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { REPO_ROOT } from '@news-tok/render'
import {
  findRunningJob,
  newOrchestrateJobId,
  readOrchestrateJob,
  writeOrchestrateJob,
  type OrchestrateJob,
  type OrchestratePhase,
} from '@/lib/orchestrate-jobs'

/**
 * Map MCP tool names → phase + Vietnamese-friendly step label. Drives
 * the home loading checklist. Tools not in the map fall back to a
 * generic "Đang xử lý…" with no phase advance.
 */
const TOOL_TO_PHASE: Record<string, { phase: OrchestratePhase; label: string }> = {
  createProject: { phase: 'starting', label: 'Tạo dự án mới…' },
  extractArticle: { phase: 'extract', label: 'Đang đọc bài báo…' },
  researchProjectAesthetic: { phase: 'research', label: 'Chọn phong cách thị giác…' },
  updateStoryboard: { phase: 'plan', label: 'Lên kịch bản từng đoạn…' },
  searchImage: { phase: 'assets', label: 'Tìm ảnh minh hoạ…' },
  searchMusic: { phase: 'assets', label: 'Chọn nhạc nền…' },
  synthesizeVoice: { phase: 'assets', label: 'Tạo giọng đọc…' },
  listVoices: { phase: 'assets', label: 'Tải danh sách giọng…' },
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

const DEFAULTS = {
  variants: 1 as 1 | 2 | 3,
  maxDurationSec: 90,
  maxSegments: 7,
  skipRender: true,
} as const

const LIMITS = {
  maxDurationSec: { min: 20, max: 120 },
  maxSegments: { min: 3, max: 15 },
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
  const perSegmentTargetSec = Math.max(
    4,
    Math.min(8, Math.round(maxDurationSec / maxSegments))
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
      ? '2. Call mcp__news-tok__extractArticle on the URL.'
      : '2. Skip extractArticle — use the text provided above as the article body.',
    '3. Call mcp__news-tok__researchProjectAesthetic and use the recommended preset trio (variantPicks) as project.variants. Keep all 3 variants in the storyboard even when rendering fewer — the user can render the rest later.',
    `4. Draft a three-part storyboard (intro + body + outro). Use at most ${maxSegments} segments total. Each segment ~${perSegmentTargetSec}s. Pick the default voice for the language. Do NOT ask the user — this is a headless run.`,
    '5. For each segment, call searchImage + synthesizeVoice in parallel. Set segment.durationSec = recommendedSegmentDurationSec.',
    '6. Call searchMusic using the musicMood from research, set bgMusic.',
    '7. Call updateStoryboard to persist.',
    skipRender
      ? '8. DO NOT call renderProject. The user will trigger render from Studio when ready. Report the project path and stop.'
      : `8. Call renderProject with variants: ${variantPicksToRender(variants)}.`,
    skipRender ? '9. Done — return the project id and absolute project directory path.' : '9. Report the absolute output path.',
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

    void runClaude(job, buildPrompt(body)).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err)
      const failed = await readOrchestrateJob(job.jobId)
      await writeOrchestrateJob({
        ...(failed ?? job),
        status: 'failed',
        endedAt: new Date().toISOString(),
        error: message,
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

function resolveClaudeCli(): string {
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH
  if (process.platform !== 'win32') return 'claude'
  // Node on Windows refuses to spawn .cmd shims with EINVAL unless shell:true,
  // which then re-parses argv and mangles multi-line prompts. Prefer the native
  // .exe when present.
  const candidates = [
    resolve(process.env.LOCALAPPDATA ?? '', 'AnthropicClaude', 'claude.exe'),
    resolve(process.env.USERPROFILE ?? '', '.local', 'bin', 'claude.exe'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return 'claude.exe'
}

async function runClaude(job: OrchestrateJob, prompt: string): Promise<void> {
  const cliPath = resolveClaudeCli()
  const args = [
    '-p',
    prompt,
    '--output-format=stream-json',
    '--verbose',
    '--permission-mode=acceptEdits',
    '--allowedTools',
    ALLOWED_TOOLS,
    '--add-dir',
    REPO_ROOT,
  ]

  // shell:true on Windows lets the spawn find claude.cmd via PATH, but it also
  // re-parses argv through cmd.exe — which mangles the multi-line prompt and
  // strips characters like `&` from URLs. Use shell:false with the .exe path
  // so we get a single, faithful argv handoff.
  //
  // stdio[0] = 'ignore' explicitly closes claude's stdin. Without this, the CLI
  // sees a pipe open with no EOF and blocks for 3 seconds waiting for input
  // ("Warning: no stdin data received in 3s") before bailing out partway
  // through the run — even though we pass the prompt via -p, not stdin.
  const child = spawn(cliPath, args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await writeOrchestrateJob({ ...job, pid: child.pid, step: 'AI đã sẵn sàng…' })

  let buffer = ''
  let lastStep = job.step
  let lastPhase: OrchestratePhase | undefined = job.phase
  let projectId: string | undefined

  const updateStep = async (
    step: string,
    phase?: OrchestratePhase
  ): Promise<void> => {
    if (step === lastStep && phase === lastPhase) return
    lastStep = step
    if (phase) lastPhase = phase
    const current = await readOrchestrateJob(job.jobId)
    if (!current || current.status !== 'running') return
    await writeOrchestrateJob({
      ...current,
      step,
      phase: phase ?? current.phase,
      projectId: projectId ?? current.projectId,
    })
  }

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      void handleLine(line)
    }
  })

  const handleLine = async (line: string) => {
    if (!projectId) {
      // The createProject MCP tool returns `{ projectId, path }` as the tool result text.
      // In stream-json that arrives as a `tool_result` block whose `content[0].text`
      // is a JSON string — so the projectId pattern appears both literally
      // (`"projectId": "..."`) and JSON-escaped (`\"projectId\": \"...\"`).
      const m =
        line.match(/"projectId"\s*:\s*"([^"]+)"/) ??
        line.match(/\\"projectId\\"\s*:\s*\\"([^\\"]+)\\"/)
      if (m) {
        projectId = m[1]
        const current = await readOrchestrateJob(job.jobId)
        if (current) await writeOrchestrateJob({ ...current, projectId })
      }
    }
    try {
      const evt = JSON.parse(line) as {
        type?: string
        message?: { content?: Array<{ type?: string; name?: string; text?: string }> }
      }
      const content = evt?.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_use' && block.name) {
            const short = block.name.replace(/^mcp__news-tok__/, '')
            const mapped = TOOL_TO_PHASE[short]
            if (mapped) {
              await updateStep(mapped.label, mapped.phase)
            } else {
              // Unknown MCP tool — keep the user informed without
              // advancing the phase checklist.
              await updateStep('Đang xử lý…')
            }
          }
        }
      }
    } catch {
      // not a json line — ignore
    }
  }

  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })

  await new Promise<void>((resolveExit, rejectExit) => {
    child.on('error', rejectExit)
    child.on('exit', (code) => {
      if (code === 0) resolveExit()
      else rejectExit(new Error(`claude exited ${code}: ${stderr.slice(-500)}`))
    })
  })

  const final = await readOrchestrateJob(job.jobId)
  if (final?.status === 'cancelled') return
  await writeOrchestrateJob({
    ...(final ?? job),
    status: projectId ? 'completed' : 'failed',
    endedAt: new Date().toISOString(),
    projectId,
    phase: projectId ? 'done' : final?.phase,
    step: projectId ? 'Hoàn tất — đang mở Studio…' : 'Không tạo được dự án',
    error: projectId ? undefined : 'No projectId detected in Claude output',
  })
}
