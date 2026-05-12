import type { TextStyle } from '@news-tok/shared/schema'
import type { WordBoundary } from '@news-tok/shared/schema'
import { resolveFontFamily } from '../../scenes/fonts.js'

/**
 * Common props every text-motion primitive accepts. The primitive owns
 * its motion math; the parent `TextBlock` owns layout (anchor, align,
 * margin, plate, stroke).
 */
export type TextPrimitiveProps = {
  text: string
  style: TextStyle
  /** Per-word timing from Edge TTS — only used by `wordHighlight`. */
  wordBoundaries?: WordBoundary[]
}

/** Style fragment shared by every primitive: typography only. */
export function typographyStyle(style: TextStyle, fontPx: number): React.CSSProperties {
  const css: React.CSSProperties = {
    fontFamily: resolveFontFamily(style.fontFamily),
    fontSize: fontPx,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    color: style.color,
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
    css.WebkitTextStroke = `${style.textStroke.widthPx}px ${style.textStroke.color}`
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
