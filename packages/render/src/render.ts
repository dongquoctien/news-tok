import { renderMedia, selectComposition } from '@remotion/renderer'
import { mkdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import {
  resolveRenderPreset,
  type Aspect,
  type AssetRef,
  type Project,
  type Segment,
} from '@news-tok/shared/schema'
import { bundleForProject } from './bundle.js'
import {
  dataDir,
  projectOutput,
  projectSegmentsDir,
} from './paths.js'
import { readStoryboard } from './storyboard.js'

/**
 * Convert an absolute path inside data/ into a `/`-prefixed URL that
 * Remotion serves from publicDir (set to dataDir() in bundle.ts). Paths
 * outside data/ are left untouched (the asset will still fail to load,
 * but the rewrite is conservative).
 */
function toPublicUrl(absPath: string): string {
  const rel = relative(dataDir(), absPath)
  if (rel.startsWith('..') || rel.startsWith(sep) || /^[a-zA-Z]:/.test(rel)) {
    return absPath
  }
  return '/public/' + rel.split(sep).join('/')
}

function rewriteAsset<T extends AssetRef | undefined>(asset: T): T {
  if (!asset) return asset
  return { ...asset, path: toPublicUrl(asset.path) } as T
}

function rewriteSegment(segment: Segment): Segment {
  return {
    ...segment,
    visuals: {
      background: rewriteAsset(segment.visuals.background),
      foreground: segment.visuals.foreground?.map((a) => rewriteAsset(a)),
    },
    audio: segment.audio
      ? {
          narration: rewriteAsset(segment.audio.narration),
          sfx: segment.audio.sfx?.map((a) => rewriteAsset(a)),
        }
      : undefined,
  }
}

function rewriteProjectAssets(project: Project): Project {
  return {
    ...project,
    segments: project.segments.map(rewriteSegment),
    bgMusic: rewriteAsset(project.bgMusic),
  }
}

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
  const inputProps = {
    storyboard: rewriteProjectAssets(segmentSubProject(project, segment)),
  }
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
    chromiumOptions: { disableWebSecurity: true },
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
  const inputProps = { storyboard: rewriteProjectAssets(project) }
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
    chromiumOptions: { disableWebSecurity: true },
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  })

  return outPath
}
