import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { dataDir } from '@news-tok/render'

export type OrchestrateStatus = 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * High-level phases the home loading UI renders as a checklist.
 * Mapping from MCP tool name → phase is in route.ts.
 *
 * - 'starting'   — Claude CLI booting + reading CLAUDE.md
 * - 'extract'    — pulling article text from URL (extractArticle)
 * - 'collect-media' — downloading article images into the cache so
 *                  they can populate project.library. Happens inside
 *                  the same extractArticle call but surfaced as its
 *                  own checklist row so the user sees what's going on.
 * - 'research'   — picking aesthetic / variant trio
 * - 'plan'       — drafting segments + writing storyboard
 * - 'assets'     — searching images, synthesizing voice, fetching music
 * - 'finalize'   — persisting storyboard (updateStoryboard): laying out
 *                  scenes + fitting durations to narration. Comes AFTER
 *                  assets because Claude calls updateStoryboard last,
 *                  once every segment has its image + voice + music.
 * - 'captions'   — Claude rewriting + persisting social captions via
 *                  generateSocialCaption + rewriteSocialCaptions.
 *                  Runs after finalize, before render.
 * - 'render'     — running ffmpeg (only when skipRender = false)
 * - 'done'       — terminal state, redirecting to Studio
 */
export type OrchestratePhase =
  | 'starting'
  | 'extract'
  | 'collect-media'
  | 'research'
  | 'plan'
  | 'assets'
  | 'finalize'
  | 'captions'
  | 'render'
  | 'done'

/**
 * Job kind discriminator. Default 'orchestrate' (the home "Tạo video"
 * flow that runs every phase). 'captions' is the dialog-Refresh flow —
 * same on-disk store but a different MCP tool set and a single phase.
 * Absent on legacy jobs (written before the field existed) is treated
 * as 'orchestrate'.
 */
export type OrchestrateJobKind = 'orchestrate' | 'captions'

export type OrchestrateJob = {
  jobId: string
  /** What kind of Claude CLI run this is. See OrchestrateJobKind. */
  kind?: OrchestrateJobKind
  status: OrchestrateStatus
  pid?: number
  startedAt: string
  endedAt?: string
  source: { type: 'url' | 'text' | 'file'; value: string }
  language: 'vi' | 'en'
  aspect: '9:16' | '16:9' | '1:1'
  /** Filled in once Claude calls createProject. */
  projectId?: string
  /** Last human-readable status line for the UI. */
  step?: string
  /** Current high-level phase — drives the checklist UI in CreatePrompt. */
  phase?: OrchestratePhase
  /** Whether the render phase should appear in the timeline (false when
   *  the caller asked to skip render, e.g. the home generate flow). */
  willRender?: boolean
  error?: string
}

const jobsRoot = () => resolve(dataDir(), 'jobs')
const jobPath = (jobId: string) => resolve(jobsRoot(), `${jobId}.json`)

async function writeAtomicJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, path)
}

export async function readOrchestrateJob(jobId: string): Promise<OrchestrateJob | null> {
  const path = jobPath(jobId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await readFile(path, 'utf8')) as OrchestrateJob
  } catch {
    return null
  }
}

export async function writeOrchestrateJob(job: OrchestrateJob): Promise<void> {
  await writeAtomicJson(jobPath(job.jobId), job)
}

export async function findRunningJob(): Promise<OrchestrateJob | null> {
  const root = jobsRoot()
  if (!existsSync(root)) return null
  const entries = await readdir(root)
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const job = await readOrchestrateJob(entry.replace(/\.json$/, ''))
    if (job?.status === 'running') return job
  }
  return null
}

export function newOrchestrateJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
