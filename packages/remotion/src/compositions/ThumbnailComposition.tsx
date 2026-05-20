import { AbsoluteFill } from 'remotion'
// Import via deep paths so the Remotion bundler doesn't pull the
// ffmpeg-static + Node fs branch from @news-tok/thumbnail/index.ts.
// The browser bundle only ever needs the pure-React renderer + the
// topic palette router.
import {
  ThumbnailRenderer,
  type ThumbnailRendererProps,
} from '@news-tok/thumbnail/layouts'
import { recipeForLayout } from '@news-tok/thumbnail/topic-router'
import type { Thumbnail, ThumbnailLayout } from '@news-tok/shared/schema'

/**
 * Remotion composition wrapper around the pure-React `ThumbnailRenderer`.
 * The composition is single-frame (durationInFrames=1) and serves as the
 * input to `renderStill` for thumbnail generation. All visual logic lives
 * in `@news-tok/thumbnail`; this file exists only to provide the
 * Remotion entry point + asset URL rewriting (the bundle serves
 * data/ at /public/...).
 */

export type ThumbnailCompositionProps = {
  thumbnail: Thumbnail
  /**
   * Topic id resolved by topic-router. Pass the project's classified
   * topic; falls back to `generic` (red breaking-news look) when absent.
   */
  topic: string
  /**
   * Brand logo URL staged into publicDir by `stageBrandAssets()`. When
   * present and the thumbnail's watermark.logoUrl is missing, fills in
   * the URL so newstokvn-* layouts pick up the channel logo automatically.
   */
  brandLogoUrl?: string
}

export function ThumbnailComposition({ thumbnail, topic, brandLogoUrl }: ThumbnailCompositionProps) {
  // recipeForLayout honours brand-locked layouts by pinning the NEWSTOKVN
  // palette regardless of topic. Other layouts still get their topic
  // recipe.
  const recipe = recipeForLayout(topic, thumbnail.layout)
  // Backfill watermark.logoUrl from the staged brand asset URL so the
  // user doesn't need to set it manually when picking a newstokvn layout.
  const watermark =
    thumbnail.watermark.kind === 'logo' && !thumbnail.watermark.logoUrl && brandLogoUrl
      ? { ...thumbnail.watermark, logoUrl: brandLogoUrl }
      : thumbnail.watermark
  const props: ThumbnailRendererProps = {
    layout: thumbnail.layout,
    edits: thumbnail.edits,
    background: thumbnail.background,
    watermark,
    recipe,
    // The bundle serves data/ at /public/... — relative-to-data paths
    // already include that prefix when the render pipeline wrote them.
    // Absolute paths (legacy storyboards) pass through untouched.
    resolveImageSrc: (p: string) => p,
  }
  return (
    <AbsoluteFill style={{ background: '#0b0b0f' }}>
      <ThumbnailRenderer {...props} />
    </AbsoluteFill>
  )
}

export type { ThumbnailLayout }
