import { renderMedia, selectComposition } from '@remotion/renderer'
import { mkdir } from 'node:fs/promises'
import { relative, resolve, sep, dirname } from 'node:path'
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
  projectDir,
  projectOutput,
  projectSegmentsDir,
} from './paths.js'
import { readStoryboard } from './storyboard.js'
import { collectUsedSfxIds, stageSfxFiles } from './sfx-staging.js'
import { stageLogoImage } from './logo-staging.js'

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

export type RenderProjectOptions = RenderOptions & {
  /**
   * Variant ids to render. `'all'` renders every variant declared on the
   * project. An empty array (or omitted) renders a single mp4 at the
   * legacy path `output.mp4`, using whichever default style each scene
   * picks.
   */
  variants?: string[] | 'all'
  /** Optional progress callback that also reports which variant is active. */
  onVariantProgress?: (info: { variantId: string; progress: number }) => void
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

  // Stage SFX into publicDir BEFORE bundling — Remotion's bundler
  // snapshots the publicDir listing into `window.remotion_staticFiles`
  // at bundle time. If we stage after, the bundler resolves the URL but
  // the snapshot has no entry, so the renderer 404s on every cue.
  const sfxIds = collectUsedSfxIds(project)
  const sfxUrlMap = await stageSfxFiles(sfxIds, project)
  const logoUrl = await stageLogoImage(project)
  const serveUrl = await bundleForProject(projectId)
  const inputProps = {
    storyboard: rewriteProjectAssets(segmentSubProject(project, segment)),
    sfxUrlMap,
    logoUrl,
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
 * Render the project as one or more mp4 files. When `opts.variants` is
 * omitted or empty, this preserves the legacy behavior and produces a
 * single `output.mp4`. Otherwise it emits `output-<variantId>.mp4` for
 * each requested variant, reusing the same bundle across variants.
 */
export async function renderProjectMedia(
  projectId: string,
  opts: RenderProjectOptions = {}
): Promise<string[]> {
  const project = await readStoryboard(projectId)
  // Stage SFX once per render call BEFORE bundling — the bundler
  // snapshots publicDir into `window.remotion_staticFiles`, so cues must
  // be on disk before bundle, not after. (Same reason as renderSegmentMedia.)
  const sfxIds = collectUsedSfxIds(project)
  const sfxUrlMap = await stageSfxFiles(sfxIds, project)
  const logoUrl = await stageLogoImage(project)
  const serveUrl = await bundleForProject(projectId)
  const compositionId = compositionIdFor(project.aspect)
  const preset = resolveRenderPreset(project.aspect, project.exportPreset)

  const projectVariants = project.variants ?? []
  const requested: (string | null)[] =
    opts.variants === 'all'
      ? projectVariants.map((v) => v.id)
      : Array.isArray(opts.variants) && opts.variants.length > 0
        ? opts.variants
        : projectVariants.length > 0
          ? [projectVariants[0]!.id]
          : [null] // legacy single render

  const outputs: string[] = []
  const rewrittenStoryboard = rewriteProjectAssets(project)

  for (const variantId of requested) {
    const outPath =
      variantId == null
        ? projectOutput(projectId)
        : resolve(projectDir(projectId), `output-${variantId}.mp4`)
    await mkdir(dirname(outPath), { recursive: true })

    const inputProps = {
      storyboard: rewrittenStoryboard,
      variantId: variantId ?? undefined,
      sfxUrlMap,
      logoUrl,
    }

    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps,
    })

    await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      pixelFormat: preset.pixelFormat,
      outputLocation: outPath,
      inputProps,
      concurrency: opts.concurrency ?? null,
      chromiumOptions: { disableWebSecurity: true },
      onProgress: ({ progress }) => {
        opts.onProgress?.(progress)
        if (variantId != null) opts.onVariantProgress?.({ variantId, progress })
      },
    })
    outputs.push(outPath)
  }
  return outputs
}
