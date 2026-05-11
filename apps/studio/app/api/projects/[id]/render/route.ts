import { NextResponse, type NextRequest } from 'next/server'
import {
  newJobId,
  readJob,
  renderProjectMedia,
  renderSegmentMedia,
  writeJob,
} from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Trigger a render asynchronously. Returns immediately with a jobId.
 * Poll GET on this endpoint for status.
 *
 * Query params:
 *   scope=segment|full (default: full)
 *   segmentId=...      (required when scope=segment)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const url = new URL(req.url)
    const scope = (url.searchParams.get('scope') ?? 'full') as 'segment' | 'full'
    const segmentId = url.searchParams.get('segmentId') ?? undefined

    if (scope === 'segment' && !segmentId) {
      return NextResponse.json(
        { error: 'segmentId is required when scope=segment' },
        { status: 400 }
      )
    }

    const existing = await readJob(params.id)
    if (existing && existing.status === 'running') {
      return NextResponse.json(
        { error: 'a render job is already running', job: existing },
        { status: 409 }
      )
    }

    const jobId = newJobId()
    await writeJob(params.id, {
      jobId,
      scope,
      segmentId: scope === 'segment' ? segmentId : undefined,
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
    })

    // Fire and forget — the Studio polls .job.json via GET.
    void runRender(params.id, jobId, scope, segmentId).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err)
      await writeJob(params.id, {
        jobId,
        scope,
        segmentId: scope === 'segment' ? segmentId : undefined,
        status: 'failed',
        progress: 0,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        error: message,
      })
    })

    return NextResponse.json({ jobId, scope, segmentId, status: 'running' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const job = await readJob(params.id)
  if (!job) {
    return NextResponse.json({ error: 'no job recorded for this project' }, { status: 404 })
  }
  return NextResponse.json(job)
}

async function runRender(
  projectId: string,
  jobId: string,
  scope: 'segment' | 'full',
  segmentId: string | undefined
): Promise<void> {
  const startedAt = new Date().toISOString()
  let lastProgress = 0
  const onProgress = async (p: number) => {
    if (p - lastProgress < 0.05 && p < 0.999) return
    lastProgress = p
    await writeJob(projectId, {
      jobId,
      scope,
      segmentId,
      status: 'running',
      progress: p,
      startedAt,
    })
  }

  const outPath =
    scope === 'segment'
      ? await renderSegmentMedia(projectId, segmentId!, { onProgress })
      : await renderProjectMedia(projectId, { onProgress })

  await writeJob(projectId, {
    jobId,
    scope,
    segmentId,
    status: 'completed',
    progress: 1,
    startedAt,
    endedAt: new Date().toISOString(),
    outputPath: outPath,
  })
}
