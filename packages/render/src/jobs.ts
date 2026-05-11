import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { projectDir } from './paths.js'

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export type JobRecord = {
  jobId: string
  scope: 'segment' | 'full'
  segmentId?: string
  status: JobStatus
  progress: number
  startedAt: string
  endedAt?: string
  outputPath?: string
  error?: string
}

function jobPath(projectId: string): string {
  return resolve(projectDir(projectId), '.job.json')
}

async function writeAtomicJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, path)
}

export async function readJob(projectId: string): Promise<JobRecord | null> {
  const path = jobPath(projectId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await readFile(path, 'utf8')) as JobRecord
  } catch {
    return null
  }
}

export async function writeJob(projectId: string, job: JobRecord): Promise<void> {
  await writeAtomicJson(jobPath(projectId), job)
}

export function newJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
