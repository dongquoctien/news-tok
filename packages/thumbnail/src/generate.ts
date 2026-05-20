import type {
  Project,
  Thumbnail,
  ThumbnailLayout,
} from '@news-tok/shared/schema'
import { ThumbnailSchema } from '@news-tok/shared/schema'
import { buildDefaultEdits } from './default-edits.js'
import { recipeForTopic, type ThumbnailTopic } from './topic-router.js'
import { lintAgainstAllPlatforms } from './safe-zones.js'
import { extractFrames, type ExtractedFrame } from './extract-frame.js'

/**
 * Produce a fully-formed `Thumbnail` config from a project + source
 * video. The caller (MCP `generateThumbnail`) then renders the still
 * to disk and writes the path back into `project.thumbnail`.
 *
 * Inputs:
 *   - project: current storyboard (we use title + language + topic for
 *     copy + palette decisions)
 *   - videoPath: absolute path to output.mp4 (or a fallback segment mp4)
 *   - outDir: where to stage candidate frame jpegs
 *   - topic: pre-classified topic from researchProjectAesthetic; falls
 *     back to 'generic'
 *   - layoutOverride: pin a specific layout regardless of topic
 *
 * Output: a Thumbnail object ready to validate + persist. The caller is
 * responsible for the final renderStill pass.
 */

export type BuildThumbnailConfigInput = {
  project: Pick<Project, 'title' | 'language' | 'segments'>
  videoPath: string
  outDir: string
  topic?: ThumbnailTopic | string
  layoutOverride?: ThumbnailLayout
  /** Override candidate frame count. Default 5 (10/30/50/70/90%). */
  frameCount?: number
}

export type BuildThumbnailConfigResult = {
  thumbnail: Thumbnail
  /** Index into `thumbnail.candidateFrames` chosen as the active bg. */
  pickedFrameIndex: number
  /** Lint output already merged into `thumbnail.safeZoneWarnings`. */
  warnings: string[]
}

function approxLineCount(text: string, width: number, fontSize: number): number {
  // Average glyph width ≈ 0.55 * fontSize for sans-serif bold. Rough
  // heuristic — purely for lint bbox estimation, not for layout.
  const charsPerLine = Math.max(8, Math.floor(width / (fontSize * 0.55)))
  const lines = Math.ceil(text.length / charsPerLine)
  return Math.max(1, Math.min(4, lines))
}

export async function buildThumbnailConfig(
  input: BuildThumbnailConfigInput
): Promise<BuildThumbnailConfigResult> {
  const recipe = recipeForTopic(input.topic ?? 'generic')
  const layout = input.layoutOverride ?? recipe.layout

  // 1. Extract candidate frames from the rendered video.
  let candidateFrames: ExtractedFrame[] = []
  try {
    candidateFrames = await extractFrames({
      videoPath: input.videoPath,
      outDir: input.outDir,
      count: input.frameCount ?? 5,
    })
  } catch {
    // Video missing or unreadable — fall back to solid bg. The caller
    // can still ship a working thumbnail without a photo.
    candidateFrames = []
  }

  // 2. Pick the middle frame as default — it's usually the "thick of the
  //    action" beat. The editor lets the user re-roll.
  const pickedIndex = candidateFrames.length > 0 ? Math.floor(candidateFrames.length / 2) : -1
  const picked = pickedIndex >= 0 ? candidateFrames[pickedIndex] : undefined

  // 3. Build default text edits inside the universal safe zone.
  const edits = buildDefaultEdits({
    layout,
    recipe,
    language: input.project.language,
    title: input.project.title,
  })

  // 4. Lint title bbox + eyebrow bbox; merge warnings.
  const warnings: string[] = []
  {
    const lines = approxLineCount(edits.title, edits.titleStyle.width, edits.titleStyle.fontSize)
    const bbox = {
      x: edits.titleStyle.x,
      y: edits.titleStyle.y,
      width: edits.titleStyle.width,
      height: Math.round(edits.titleStyle.fontSize * edits.titleStyle.lineHeight * lines),
    }
    const lint = lintAgainstAllPlatforms(bbox, 'Title')
    warnings.push(...lint.warnings)
  }
  if (edits.eyebrowStyle && edits.eyebrow) {
    const bbox = {
      x: edits.eyebrowStyle.x,
      y: edits.eyebrowStyle.y,
      width: edits.eyebrowStyle.width,
      height: Math.round(edits.eyebrowStyle.fontSize * edits.eyebrowStyle.lineHeight * 1.4),
    }
    const lint = lintAgainstAllPlatforms(bbox, 'Eyebrow')
    warnings.push(...lint.warnings)
  }

  // 5. Assemble + validate.
  // Brand-locked layouts get the logo watermark by default so the cover
  // doubles as a channel stamp. The other 6 layouts keep the plain
  // text plate to stay backwards compatible.
  const isBrandLayout =
    layout === 'newstokvn-breaking' || layout === 'newstokvn-flash' || layout === 'newstokvn-cover'
  const raw: Thumbnail = {
    layout,
    background: picked
      ? { kind: 'random-frame', framePath: picked.path, atSec: picked.atSec }
      : { kind: 'solid', color: recipe.palette.ink },
    edits,
    watermark: {
      enabled: true,
      kind: isBrandLayout ? 'logo' : 'text',
      text: '@newstokvn',
      logoSize: isBrandLayout ? 80 : 96,
      position: 'bottom-right',
      color: '#ffffff',
      fontSize: 30,
      bgColor: isBrandLayout ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)',
    },
    candidateFrames: candidateFrames.map((f) => ({ path: f.path, atSec: f.atSec })),
    safeZoneWarnings: warnings,
    generatedAt: new Date().toISOString(),
  }
  const thumbnail = ThumbnailSchema.parse(raw)
  return { thumbnail, pickedFrameIndex: pickedIndex, warnings }
}
