import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { dataDir } from '@news-tok/render'

export type OrchestrateStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export type OrchestrateJob = {
  jobId: string
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
