import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import {
  ProjectSchema,
  ThumbnailSchema,
  type Thumbnail,
  type ThumbnailLayout,
} from '@news-tok/shared/schema'
import {
  projectDir,
  projectOutput,
  readStoryboard,
  writeStoryboard,
  renderThumbnailStill,
} from '@news-tok/render'
import {
  buildThumbnailConfig,
  extractFrames,
  recipeForTopic,
} from '@news-tok/thumbnail'
import { researchProjectAesthetic } from './research.js'

/**
 * MCP tools for thumbnail generation. Wires the `@news-tok/thumbnail`
 * package + `@news-tok/render` thumbnail still-frame renderer into the
 * MCP stdio server. Three tools land here:
 *
 *   - generateThumbnail({ projectId, layout? }) — full path: extract
 *     candidate frames, build edits inside the universal safe zone,
 *     persist Thumbnail to storyboard, renderStill to thumb.jpg.
 *   - regenerateThumbnail({ projectId }) — keep existing edits, only
 *     re-extract frames + re-render. Used after a user re-renders the
 *     video.
 *   - previewSafeZones({ projectId }) — render the current thumbnail
 *     with all 4 platform unsafe zones painted as translucent masks,
 *     so the user can verify offline.
 */

export const thumbnailToolNames = ['generateThumbnail', 'regenerateThumbnail', 'previewSafeZones'] as const

export type GenerateThumbnailInput = {
  projectId: string
  /** Override the auto-picked layout. */
  layout?: ThumbnailLayout
  /** Override the candidate frame count. Default 5. */
  frameCount?: number
}

export type GenerateThumbnailResult = {
  thumbnail: Thumbnail
  path: string
  warnings: string[]
}

function classifyTopicFromProject(project: { title: string; segments: { text: string }[]; language: 'vi' | 'en' }): string {
  const articleText = project.segments.map((s) => s.text).join('\n\n')
  const res = researchProjectAesthetic({
    articleTitle: project.title,
    articleText,
    language: project.language,
  })
  return res.topic
}

export async function runGenerateThumbnail(
  args: GenerateThumbnailInput
): Promise<GenerateThumbnailResult> {
  const project = await readStoryboard(args.projectId)
  const videoPath = projectOutput(args.projectId)
  if (!existsSync(videoPath)) {
    throw new Error(
      `No rendered video at ${videoPath}. Run renderProject first; thumbnails extract frames from output.mp4.`
    )
  }
  const topic = classifyTopicFromProject(project)
  const candidatesDir = resolve(projectDir(args.projectId), 'thumb-candidates')

  const { thumbnail, warnings } = await buildThumbnailConfig({
    project: { title: project.title, language: project.language, segments: project.segments },
    videoPath,
    outDir: candidatesDir,
    topic,
    layoutOverride: args.layout,
    frameCount: args.frameCount,
  })

  // Render the still to disk.
  const path = await renderThumbnailStill({
    projectId: args.projectId,
    thumbnail,
    topic,
  })

  // Persist into the storyboard.
  const updated = ProjectSchema.parse({
    ...project,
    thumbnail: { ...thumbnail, path },
    updatedAt: new Date().toISOString(),
  })
  await writeStoryboard(args.projectId, updated)

  return { thumbnail: { ...thumbnail, path }, path, warnings }
}

export async function runRegenerateThumbnail(
  args: { projectId: string }
): Promise<GenerateThumbnailResult> {
  const project = await readStoryboard(args.projectId)
  if (!project.thumbnail) {
    // No existing config → fall through to the full generate path.
    return runGenerateThumbnail({ projectId: args.projectId })
  }
  const topic = classifyTopicFromProject(project)
  const videoPath = projectOutput(args.projectId)
  if (!existsSync(videoPath)) {
    throw new Error(`No rendered video at ${videoPath}. Run renderProject first.`)
  }

  // Re-extract frames (cache-aware — no-op if mtime hasn't changed).
  const candidatesDir = resolve(projectDir(args.projectId), 'thumb-candidates')
  const frames = await extractFrames({ videoPath, outDir: candidatesDir, count: 5 })
  // If the picked frame still exists in the candidate list, keep it;
  // otherwise fall back to the middle frame.
  const currentBg = project.thumbnail.background
  let picked = frames[Math.floor(frames.length / 2)]
  if (currentBg.kind === 'random-frame') {
    const match = frames.find((f) => f.path === currentBg.framePath)
    if (match) picked = match
  }

  const next: Thumbnail = ThumbnailSchema.parse({
    ...project.thumbnail,
    background:
      picked != null
        ? { kind: 'random-frame', framePath: picked.path, atSec: picked.atSec }
        : project.thumbnail.background,
    candidateFrames: frames.map((f) => ({ path: f.path, atSec: f.atSec })),
    generatedAt: new Date().toISOString(),
  })

  const path = await renderThumbnailStill({
    projectId: args.projectId,
    thumbnail: next,
    topic,
  })

  const updated = ProjectSchema.parse({
    ...project,
    thumbnail: { ...next, path },
    updatedAt: new Date().toISOString(),
  })
  await writeStoryboard(args.projectId, updated)

  return { thumbnail: { ...next, path }, path, warnings: project.thumbnail.safeZoneWarnings }
}

export async function runPreviewSafeZones(args: { projectId: string }): Promise<{
  path: string
  zones: Array<{ platform: string; rect: { x: number; y: number; width: number; height: number } }>
}> {
  // Defer the actual mask paint to PR4 (Studio editor). For now, return
  // the rect list so the orchestrator can show the user what would be
  // checked without an extra render.
  const { PLATFORM_SAFE_ZONES } = await import('@news-tok/thumbnail/safe-zones')
  const zones: Array<{ platform: string; rect: { x: number; y: number; width: number; height: number } }> = []
  for (const p of Object.values(PLATFORM_SAFE_ZONES)) {
    for (const r of p.unsafe) {
      zones.push({ platform: p.platform, rect: r })
    }
  }
  return { path: resolve(projectDir(args.projectId), 'thumb.jpg'), zones }
}

export const generateThumbnailInputSchema = {
  projectId: z.string().min(1),
  layout: z
    .enum([
      'news-breaking',
      'news-weather',
      'entertainment-bomb',
      'science-clean',
      'knowledge-bookish',
      'sports-hype',
    ])
    .optional(),
  frameCount: z.number().int().min(1).max(10).optional(),
}

export const regenerateThumbnailInputSchema = {
  projectId: z.string().min(1),
}

export const previewSafeZonesInputSchema = {
  projectId: z.string().min(1),
}
