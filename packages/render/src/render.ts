import { renderMedia, selectComposition } from '@remotion/renderer'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  resolveRenderPreset,
  type Aspect,
  type Project,
  type Segment,
} from '@news-tok/shared/schema'
import { bundleForProject } from './bundle.js'
import {
  projectOutput,
  projectSegmentsDir,
} from './paths.js'
import { readStoryboard } from './storyboard.js'

function compositionIdFor(aspect: Aspect): string {
  switch (aspect) {
    case '9:16':
      return 'NewsTok916'
    case '16:9':
      return 'NewsTok169'
    case '1:1':
      return 'NewsTok11'
  }
}

function segmentSubProject(project: Project, segment: Segment): Project {
  return { ...project, segments: [segment] }
}

export type RenderOptions = {
  /** Override concurrency. Defaults to Remotion auto. */
  concurrency?: number
  /** Optional progress callback (0..1). */
  onProgress?: (progress: number) => void
}

export async function renderSegmentMedia(
  projectId: string,
  segmentId: string,
  opts: RenderOptions = {}
): Promise<string> {
  const project = await readStoryboard(projectId)
  const segment = project.segments.find((s) => s.id === segmentId)
  if (!segment) {
    throw new Error(`Segment ${segmentId} not found in project ${projectId}`)
  }

  const serveUrl = await bundleForProject(projectId)
  const inputProps = { storyboard: segmentSubProject(project, segment) }
  const compositionId = compositionIdFor(project.aspect)
  const preset = resolveRenderPreset(project.aspect, project.exportPreset)

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  })

  const outDir = projectSegmentsDir(projectId)
  await mkdir(outDir, { recursive: true })
  const outPath = resolve(outDir, `${segmentId}.mp4`)

  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    pixelFormat: preset.pixelFormat,
    outputLocation: outPath,
    inputProps,
    concurrency: opts.concurrency ?? null,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  })

  return outPath
}

/**
 * Render the entire project as a single mp4 (no ffmpeg concat needed —
 * Remotion renders the full composition with all segments).
 * NOTE: In M2 we may switch to per-segment render + ffmpeg concat to enable
 * incremental edits; for M1 smoke test, full-composition render is simpler.
 */
export async function renderProjectMedia(
  projectId: string,
  opts: RenderOptions = {}
): Promise<string> {
  const project = await readStoryboard(projectId)
  const serveUrl = await bundleForProject(projectId)
  const inputProps = { storyboard: project }
  const compositionId = compositionIdFor(project.aspect)
  const preset = resolveRenderPreset(project.aspect, project.exportPreset)

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  })

  const outPath = projectOutput(projectId)
  await mkdir(resolve(outPath, '..'), { recursive: true })

  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    pixelFormat: preset.pixelFormat,
    outputLocation: outPath,
    inputProps,
    concurrency: opts.concurrency ?? null,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  })

  return outPath
}
