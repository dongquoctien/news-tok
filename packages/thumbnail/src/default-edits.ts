import type { Thumbnail, ThumbnailLayout, ThumbnailTextStyle } from '@news-tok/shared/schema'
import { UNIVERSAL_SAFE_ZONE, THUMB_WIDTH, THUMB_HEIGHT } from './safe-zones.js'
import { type LayoutRecipe } from './topic-router.js'

/**
 * Per-layout typography + positioning defaults. Coordinates land inside
 * UNIVERSAL_SAFE_ZONE (y range 250..1440) so a thumbnail straight out
 * of `generateThumbnail` reads safely on every platform without the
 * user touching the editor.
 *
 * Each block is the "starting point" — the editor lets the user drag /
 * resize / restyle, and the lint pass re-runs whenever a coordinate
 * changes. Values below pick deliberate, layout-specific anchors:
 *
 *   - news-breaking / news-weather → headline lives in the lower third,
 *     leaving the top of the safe zone for the eyebrow chip + photo
 *     focal point.
 *   - entertainment-bomb / sports-hype → headline drops to bottom of
 *     safe zone (huge uppercase) so the photo dominates the upper 2/3.
 *   - science-clean → headline floats in the middle (gradient bg
 *     replaces the photo focal point, so we have the full safe zone).
 *   - knowledge-bookish → headline anchored top-of-safe (cream paper
 *     reads top-down like a printed page).
 */

export type DefaultEditsInput = {
  layout: ThumbnailLayout
  recipe: LayoutRecipe
  language: 'vi' | 'en'
  title: string
  /** Optional accent phrase, otherwise auto-extracted from `**...**` markers. */
  accent?: string
  /** Optional eyebrow override; falls back to recipe.defaultEyebrow. */
  eyebrow?: string
}

const FONT_VI = '"Be Vietnam Pro", Inter, sans-serif'
const FONT_EN = 'Inter, sans-serif'

function fontFor(language: 'vi' | 'en'): string {
  return language === 'vi' ? FONT_VI : FONT_EN
}

function safeZoneCenterY(): number {
  return UNIVERSAL_SAFE_ZONE.y + UNIVERSAL_SAFE_ZONE.height / 2
}

function splitAccent(text: string): { plain: string; accent?: string } {
  const m = text.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/s)
  if (!m) return { plain: text }
  // We don't want to lose the surrounding plain text — re-stitch without
  // the markers and return the accent slice separately so layouts can
  // repaint just that span.
  return { plain: (m[1] ?? '') + (m[2] ?? '') + (m[3] ?? ''), accent: m[2] }
}

const TITLE_MARGIN_X = 56

/**
 * Produce the default title style for a layout. Sizing is "weight by
 * layout family" — news layouts use a big 88px bold; entertainment /
 * sports go uppercase at 96px; science / knowledge keep a calmer 72px
 * regular weight so the editorial feel sticks.
 */
function titleStyleFor(layout: ThumbnailLayout, recipe: LayoutRecipe, language: 'vi' | 'en'): ThumbnailTextStyle {
  const width = THUMB_WIDTH - TITLE_MARGIN_X * 2
  const baseFont = fontFor(language)
  switch (layout) {
    case 'news-breaking':
      return {
        x: TITLE_MARGIN_X,
        y: 980,
        width,
        fontSize: 88,
        fontWeight: 900,
        color: recipe.palette.accent,
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: -0.5,
        lineHeight: 1.08,
        uppercase: false,
      }
    case 'news-weather':
      return {
        x: TITLE_MARGIN_X,
        y: 1100,
        width,
        fontSize: 92,
        fontWeight: 900,
        color: '#FFFFFF',
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: -0.5,
        lineHeight: 1.06,
        uppercase: false,
      }
    case 'entertainment-bomb':
      return {
        x: TITLE_MARGIN_X,
        y: 1050,
        width,
        fontSize: 96,
        fontWeight: 900,
        color: '#FFFFFF',
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: -1,
        lineHeight: 1.0,
        uppercase: true,
      }
    case 'science-clean':
      return {
        x: TITLE_MARGIN_X,
        y: 620,
        width,
        fontSize: 78,
        fontWeight: 800,
        color: recipe.palette.accent,
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: -0.5,
        lineHeight: 1.1,
        uppercase: false,
      }
    case 'knowledge-bookish':
      return {
        x: TITLE_MARGIN_X,
        y: 360,
        width,
        fontSize: 80,
        fontWeight: 700,
        color: recipe.palette.ink,
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: -0.5,
        lineHeight: 1.12,
        uppercase: false,
      }
    case 'sports-hype':
      return {
        x: TITLE_MARGIN_X,
        y: 1000,
        width,
        fontSize: 104,
        fontWeight: 900,
        color: '#FFFFFF',
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: -1,
        lineHeight: 0.98,
        uppercase: true,
      }
    case 'newstokvn-breaking':
      // Slanted bold uppercase, white on deep purple, lower 3rd anchor.
      // Larger font + tighter line-height matches the brand banner.
      return {
        x: TITLE_MARGIN_X + 100, // shift right of the lightning bolt
        y: 1020,
        width: width - 100,
        fontSize: 92,
        fontWeight: 900,
        color: '#FFFFFF',
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: -1,
        lineHeight: 0.98,
        uppercase: true,
      }
    case 'newstokvn-flash':
      // Centered slanted headline between the two flanking zap bolts.
      return {
        x: TITLE_MARGIN_X + 120,
        y: 1020,
        width: width - 240,
        fontSize: 84,
        fontWeight: 900,
        color: '#FFFFFF',
        bgColor: undefined,
        align: 'center',
        fontFamily: baseFont,
        letterSpacing: -0.5,
        lineHeight: 1.0,
        uppercase: true,
      }
    case 'newstokvn-cover':
      // Headline anchors below the centered logo (which lives at
      // y=380..860). Capped fontSize to keep 3-line VN titles inside
      // the safe zone above the tagline at y=1400.
      return {
        x: TITLE_MARGIN_X,
        y: 950,
        width,
        fontSize: 76,
        fontWeight: 900,
        color: '#FFFFFF',
        bgColor: undefined,
        align: 'center',
        fontFamily: baseFont,
        letterSpacing: -0.5,
        lineHeight: 1.02,
        uppercase: true,
      }
    default: {
      const _never: never = layout
      void _never
      return {
        x: TITLE_MARGIN_X,
        y: safeZoneCenterY() - 80,
        width,
        fontSize: 80,
        fontWeight: 800,
        color: '#FFFFFF',
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: 0,
        lineHeight: 1.1,
        uppercase: false,
      }
    }
  }
}

function eyebrowStyleFor(layout: ThumbnailLayout, recipe: LayoutRecipe, language: 'vi' | 'en'): ThumbnailTextStyle | undefined {
  const baseFont = fontFor(language)
  switch (layout) {
    case 'news-breaking':
      return {
        x: TITLE_MARGIN_X,
        y: 880,
        width: 360,
        fontSize: 36,
        fontWeight: 900,
        color: recipe.palette.accent,
        bgColor: recipe.palette.primary,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: 4,
        lineHeight: 1,
        uppercase: true,
      }
    case 'news-weather':
      return {
        x: TITLE_MARGIN_X,
        y: 280,
        width: 460,
        fontSize: 34,
        fontWeight: 900,
        color: '#FFFFFF',
        bgColor: recipe.palette.primary,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: 3,
        lineHeight: 1,
        uppercase: true,
      }
    case 'entertainment-bomb':
      return {
        x: TITLE_MARGIN_X,
        y: 940,
        width: 420,
        fontSize: 38,
        fontWeight: 900,
        color: recipe.palette.ink,
        bgColor: recipe.palette.primary,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: 3,
        lineHeight: 1,
        uppercase: true,
      }
    case 'science-clean':
      return {
        x: TITLE_MARGIN_X,
        y: 510,
        width: 380,
        fontSize: 32,
        fontWeight: 700,
        color: recipe.palette.primary,
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: 5,
        lineHeight: 1,
        uppercase: true,
      }
    case 'knowledge-bookish':
      return {
        x: TITLE_MARGIN_X,
        y: 280,
        width: 360,
        fontSize: 30,
        fontWeight: 700,
        color: recipe.palette.secondary ?? recipe.palette.primary,
        bgColor: undefined,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: 6,
        lineHeight: 1,
        uppercase: true,
      }
    case 'sports-hype':
      return {
        x: TITLE_MARGIN_X,
        y: 920,
        width: 380,
        fontSize: 38,
        fontWeight: 900,
        color: recipe.palette.ink,
        bgColor: recipe.palette.primary,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: 3,
        lineHeight: 1,
        uppercase: true,
      }
    case 'newstokvn-breaking':
      // Optional channel chip top-left (decorator paints the
      // BREAKING + 24/7 stacked badge on the right). Keeps a small
      // category eyebrow so the user can label this segment.
      return {
        x: TITLE_MARGIN_X,
        y: 940,
        width: 320,
        fontSize: 32,
        fontWeight: 900,
        color: recipe.palette.ink,
        bgColor: recipe.palette.accent,
        align: 'left',
        fontFamily: baseFont,
        letterSpacing: 4,
        lineHeight: 1,
        uppercase: true,
      }
    case 'newstokvn-flash':
      return {
        x: TITLE_MARGIN_X,
        y: 900,
        width: 360,
        fontSize: 32,
        fontWeight: 900,
        color: recipe.palette.ink,
        bgColor: recipe.palette.accent,
        align: 'center',
        fontFamily: baseFont,
        letterSpacing: 4,
        lineHeight: 1,
        uppercase: true,
      }
    case 'newstokvn-cover':
      // Tagline-style eyebrow at the bottom (matches the brand banner
      // "TIN NHANH • XU HƯỚNG • NỔI BẬT"). Pushed well below the
      // headline so the two don't overlap when the headline wraps to
      // 3-4 lines on long Vietnamese titles.
      return {
        x: TITLE_MARGIN_X,
        y: 1400,
        width: THUMB_WIDTH - TITLE_MARGIN_X * 2,
        fontSize: 28,
        fontWeight: 700,
        color: '#c4b5fd',
        bgColor: undefined,
        align: 'center',
        fontFamily: baseFont,
        letterSpacing: 4,
        lineHeight: 1,
        uppercase: true,
      }
    default:
      return undefined
  }
}

/**
 * Produce a fully-formed `Thumbnail.edits` object for a layout + title.
 * The result lands every text block inside UNIVERSAL_SAFE_ZONE — verified
 * by the unit test in `default-edits.test.ts`.
 */
export function buildDefaultEdits(input: DefaultEditsInput): Thumbnail['edits'] {
  const { layout, recipe, language, title } = input
  const split = splitAccent(title)
  const eyebrow = input.eyebrow ?? recipe.defaultEyebrow[language]

  return {
    title: split.plain,
    // Cover layout uses the brand tagline as the eyebrow when the
    // caller didn't pass one — matches the channel banner instead of
    // a "BREAKING" chip.
    eyebrow:
      layout === 'newstokvn-cover' && !input.eyebrow
        ? input.language === 'vi'
          ? 'TIN NHANH · XU HƯỚNG · NỔI BẬT'
          : 'FAST NEWS · TRENDS · TOP STORIES'
        : eyebrow,
    accent: input.accent ?? split.accent,
    titleStyle: titleStyleFor(layout, recipe, language),
    eyebrowStyle: eyebrowStyleFor(layout, recipe, language),
    chip: undefined,
    vignette: layout === 'news-breaking' || layout === 'entertainment-bomb' || layout === 'sports-hype'
      ? 0.3
      : layout === 'newstokvn-breaking' || layout === 'newstokvn-flash' || layout === 'newstokvn-cover'
        ? 0.1 // decorator already paints a deep purple wash
        : 0.15,
    overlay:
      layout === 'news-breaking' || layout === 'entertainment-bomb' || layout === 'sports-hype'
        ? { color: '#000000', opacity: 0.35 }
        : undefined,
  }
}

/**
 * Layout-aware vertical anchor for face/subject focal point. Used by the
 * background placement step so the focal point of the picked frame lands
 * in the *upper* portion of the safe zone for layouts that anchor text
 * at the bottom, and vice-versa.
 */
export function focalAnchorYFor(layout: ThumbnailLayout): number {
  switch (layout) {
    case 'news-breaking':
    case 'entertainment-bomb':
    case 'sports-hype':
      // Headline lives bottom-3rd → put face near y=600 (upper-middle).
      return 600
    case 'news-weather':
      return 700
    case 'science-clean':
      return safeZoneCenterY()
    case 'knowledge-bookish':
      // Headline up top → push face to lower-middle.
      return 1100
    default:
      return safeZoneCenterY()
  }
}

export { THUMB_HEIGHT }
