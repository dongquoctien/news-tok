import type { ColorOverride, TextStyle, WordBoundary } from '@news-tok/shared/schema'
import { resolveFontFamily } from '../../scenes/fonts.js'

/**
 * Common props every text-motion primitive accepts. The primitive owns
 * its motion math; the parent `TextBlock` owns layout (anchor, align,
 * margin, plate, stroke).
 */
export type TextPrimitiveProps = {
  text: string
  style: TextStyle
  /** Per-word timing from Edge TTS. Used by `wordHighlight` and `karaoke`. */
  wordBoundaries?: WordBoundary[]
  /**
   * Resolved font id (one of `ALLOWED_FONT_IDS`). When provided, overrides
   * `style.fontFamily`. The composition computes this from the variant /
   * segment / style chain so primitives don't repeat the lookup.
   */
  fontOverride?: string
  /**
   * Resolved per-segment color overrides (variant override > segment
   * override). Each field, when present, replaces the matching TextStyle
   * field at render time. Karaoke primitives also read `accent` / `idle`
   * directly so they don't have to thread through typographyStyle.
   */
  colorOverride?: ColorOverride
}

/** Style fragment shared by every primitive: typography only. */
export function typographyStyle(
  style: TextStyle,
  fontPx: number,
  fontOverride?: string,
  colorOverride?: ColorOverride
): React.CSSProperties {
  const css: React.CSSProperties = {
    fontFamily: resolveFontFamily(fontOverride ?? style.fontFamily),
    fontSize: fontPx,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    color: colorOverride?.primary ?? style.color,
    textAlign: style.align,
    margin: 0,
  }
  if (style.gradientFill) {
    css.background = `linear-gradient(${style.gradientFill.angleDeg}deg, ${style.gradientFill.from}, ${style.gradientFill.to})`
    css.WebkitBackgroundClip = 'text'
    css.backgroundClip = 'text'
    css.color = 'transparent'
    css.WebkitTextFillColor = 'transparent'
  }
  if (style.textStroke) {
    const strokeColor = colorOverride?.stroke ?? style.textStroke.color
    const side = style.textStroke.side ?? 'outside'
    css.WebkitTextStroke = `${style.textStroke.widthPx}px ${strokeColor}`
    // `paint-order` lets us flip whether the fill or the stroke is
    // drawn on top. Default browser behaviour (`fill stroke markers`)
    // paints the stroke on top of the fill, which makes the stroke
    // appear to grow inward AND outward — i.e. 'center'. Setting
    // `stroke fill markers` paints the fill on top of the stroke, so
    // the stroke is fully hidden where it overlaps the fill — what
    // users perceive as an 'outside' stroke. For 'inside', we keep
    // the default order BUT also tint the fill toward the background
    // colour so the eaten-in shape reads as an inner stroke.
    if (side === 'outside') {
      ;(css as React.CSSProperties & { paintOrder: string }).paintOrder = 'stroke fill markers'
    } else if (side === 'inside') {
      ;(css as React.CSSProperties & { paintOrder: string }).paintOrder = 'fill stroke markers'
    } else {
      // 'center' — leave paint-order at the browser default.
    }
  }
  if (style.textShadow) {
    const main = `${style.textShadow.offsetX}px ${style.textShadow.offsetY}px ${style.textShadow.blur}px ${style.textShadow.color}`
    const second = style.textShadow.secondary
      ? `, ${style.textShadow.secondary.offsetX}px ${style.textShadow.secondary.offsetY}px ${style.textShadow.secondary.blur}px ${style.textShadow.secondary.color}`
      : ''
    css.textShadow = main + second
  }
  return css
}
