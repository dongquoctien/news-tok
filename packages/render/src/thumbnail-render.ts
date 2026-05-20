import { renderStill, selectComposition } from '@remotion/renderer'
import { mkdir, copyFile } from 'node:fs/promises'
import { relative, resolve, sep, dirname } from 'node:path'
import type { Project, Thumbnail } from '@news-tok/shared/schema'
import { resolveDataPath } from '@news-tok/shared/paths'
import { bundleForProject } from './bundle.js'
import { stageBrandAssets } from './brand-staging.js'
import { dataDir, projectDir } from './paths.js'

/**
 * Render a single thumbnail still (1080x1920 JPG) for a project using the
 * `Thumbnail916` composition registered in `@news-tok/remotion`. Returns
 * the absolute path to the written file.
 *
 * The bundle is reused from the main video pipeline (same `bundleForProject`)
 * so we don't pay an extra Remotion compile pass — both video + thumbnail
 * render off the same publicDir + entry.
 */

function toPublicUrl(p: string): string {
  const abs = resolveDataPath(p)
  const rel = relative(dataDir(), abs)
  if (rel.startsWith('..') || rel.startsWith(sep) || /^[a-zA-Z]:/.test(rel)) {
    return abs
  }
  return '/public/' + rel.split(sep).join('/')
}

function rewriteThumbnailAssets(thumbnail: Thumbnail): Thumbnail {
  let next: Thumbnail = thumbnail
  const bg = thumbnail.background
  if (bg.kind === 'random-frame') {
    next = { ...next, background: { ...bg, framePath: toPublicUrl(bg.framePath) } }
  } else if (bg.kind === 'asset-ref') {
    next = {
      ...next,
      background: { ...bg, asset: { ...bg.asset, path: toPublicUrl(bg.asset.path) } },
    }
  }
  // Watermark logo URL — rewrite if it's a disk path, leave as-is if
  // already a public URL (e.g. /public/newstokvn-logo.png from staging).
  if (next.watermark.logoUrl && !next.watermark.logoUrl.startsWith('/public/')) {
    next = {
      ...next,
      watermark: { ...next.watermark, logoUrl: toPublicUrl(next.watermark.logoUrl) },
    }
  }
  return next
}

export type RenderThumbnailOptions = {
  projectId: string
  /** The thumbnail config to render. Usually project.thumbnail. */
  thumbnail: Thumbnail
  /** Topic id resolved by topic-router. Defaults to 'generic'. */
  topic?: string
  /** Output path override. Defaults to `data/projects/<id>/thumb.jpg`. */
  outputPath?: string
  /** Image quality 1..100. Default 92 (good balance for JPG thumbnails). */
  quality?: number
}

export async function renderThumbnailStill(opts: RenderThumbnailOptions): Promise<string> {
  const outDir = projectDir(opts.projectId)
  await mkdir(outDir, { recursive: true })
  const outputPath = opts.outputPath ?? resolve(outDir, 'thumb.jpg')

  // Stage the channel logo into publicDir BEFORE bundling so the
  // newstokvn-* layouts can reference it at /public/newstokvn-logo.png.
  // Idempotent — re-staging when the file is already there is a no-op.
  await stageBrandAssets()
  const brandLogoUrl = '/public/newstokvn-logo.png'

  const serveUrl = await bundleForProject(opts.projectId)
  const inputProps = {
    thumbnail: rewriteThumbnailAssets(opts.thumbnail),
    topic: opts.topic ?? 'generic',
    brandLogoUrl,
  }

  const composition = await selectComposition({
    serveUrl,
    id: 'Thumbnail916',
    inputProps,
  })

  await renderStill({
    composition,
    serveUrl,
    output: outputPath,
    inputProps,
    imageFormat: 'jpeg',
    jpegQuality: opts.quality ?? 92,
    chromiumOptions: { disableWebSecurity: true },
  })

  return outputPath
}

/**
 * Convenience: render a thumbnail straight from a project's stored
 * config + topic. Throws when `project.thumbnail` is missing.
 */
export async function renderProjectThumbnail(project: Project, topic?: string): Promise<string> {
  if (!project.thumbnail) {
    throw new Error(`Project ${project.id} has no thumbnail config — call generateThumbnail first`)
  }
  return renderThumbnailStill({
    projectId: project.id,
    thumbnail: project.thumbnail,
    topic,
  })
}

export { copyFile as _copyFile }
