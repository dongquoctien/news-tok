import type { TextStyle } from '@news-tok/shared/schema'

/**
 * Translate a logical font id (beVietnamPro, anton, …) into a CSS
 * font-family stack that the browser can render in Studio previews
 * without round-tripping through Remotion's webpack pipeline. Falls
 * back to the literal value for ids the browser doesn't know (so
 * a user style that hand-codes `"My Custom"` still renders).
 */
const FONT_ID_TO_CSS: Record<string, string> = {
  // M7 pool
  beVietnamPro: '"Be Vietnam Pro", system-ui, sans-serif',
  inter: 'Inter, system-ui, sans-serif',
  montserrat: 'Montserrat, system-ui, sans-serif',
  anton: 'Anton, "Arial Narrow", sans-serif',
  bebasNeue: '"Bebas Neue", "Arial Narrow", sans-serif',
  playfairDisplay: '"Playfair Display", Georgia, serif',
  jetBrainsMono: '"JetBrains Mono", ui-monospace, monospace',
  lexend: 'Lexend, system-ui, sans-serif',
  manrope: 'Manrope, system-ui, sans-serif',
  oswald: 'Oswald, "Arial Narrow", sans-serif',
  archivoBlack: '"Archivo Black", system-ui, sans-serif',
  nunito: 'Nunito, system-ui, sans-serif',
  // M10 expansion
  bangers: 'Bangers, "Comic Sans MS", cursive',
  barlow: 'Barlow, system-ui, sans-serif',
  dmSans: '"DM Sans", system-ui, sans-serif',
  kanit: 'Kanit, system-ui, sans-serif',
  merriweather: 'Merriweather, Georgia, serif',
  openSans: '"Open Sans", system-ui, sans-serif',
  outfit: 'Outfit, system-ui, sans-serif',
  plusJakartaSans: '"Plus Jakarta Sans", system-ui, sans-serif',
  poppins: 'Poppins, system-ui, sans-serif',
  prompt: 'Prompt, system-ui, sans-serif',
  quicksand: 'Quicksand, system-ui, sans-serif',
  raleway: 'Raleway, system-ui, sans-serif',
  roboto: 'Roboto, system-ui, sans-serif',
  robotoCondensed: '"Roboto Condensed", "Arial Narrow", sans-serif',
  rubik: 'Rubik, system-ui, sans-serif',
  sourceSans3: '"Source Sans 3", system-ui, sans-serif',
  spaceGrotesk: '"Space Grotesk", system-ui, sans-serif',
  spaceMono: '"Space Mono", ui-monospace, monospace',
  tikTokSans: '"TikTok Sans", system-ui, sans-serif',
  workSans: '"Work Sans", system-ui, sans-serif',
}

export function previewFontStack(fontFamily: string): string {
  return FONT_ID_TO_CSS[fontFamily] ?? fontFamily
}

/**
 * Compute the inline style for the plate (solid / gradient background
 * behind the text). Matches the renderer's logic so the Studio preview
 * stays faithful to the final mp4.
 */
export function plateCss(style: TextStyle): React.CSSProperties {
  const bg = style.background
  if (bg.kind === 'none') return {}
  if (bg.kind === 'solid') {
    return {
      background: bg.color,
      opacity: bg.opacity,
      padding: `${bg.paddingPct}px ${bg.paddingPct * 2}px`,
      borderRadius: bg.radiusPx,
    }
  }
  return {
    background: `linear-gradient(${bg.angleDeg}deg, ${bg.from}, ${bg.to})`,
    padding: `${bg.paddingPct}px ${bg.paddingPct * 2}px`,
    borderRadius: bg.radiusPx,
  }
}

/**
 * Compute the inline style for the text body. Mirrors the renderer's
 * gradient-fill / stroke / shadow paths so a card preview and the final
 * render look the same. `scale` controls how aggressively `fontSize`
 * (designed for the 1080-wide canvas) is compressed into the small
 * preview tile.
 */
export function textCss(style: TextStyle, scale = 3.5): React.CSSProperties {
  const css: React.CSSProperties = {
    fontFamily: previewFontStack(style.fontFamily),
    fontSize: Math.max(14, Math.min(80, style.fontSize / scale)),
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing * 0.4,
    lineHeight: style.lineHeight,
    color: style.color,
    textAlign: style.align,
    margin: 0,
  }
  if (style.gradientFill) {
    css.background = `linear-gradient(${style.gradientFill.angleDeg}deg, ${style.gradientFill.from}, ${style.gradientFill.to})`
    ;(css as React.CSSProperties & { WebkitBackgroundClip: string }).WebkitBackgroundClip = 'text'
    ;(css as React.CSSProperties & { backgroundClip: string }).backgroundClip = 'text'
    css.color = 'transparent'
    ;(css as React.CSSProperties & { WebkitTextFillColor: string }).WebkitTextFillColor =
      'transparent'
  }
  if (style.textStroke) {
    ;(css as React.CSSProperties & { WebkitTextStroke: string }).WebkitTextStroke = `${
      Math.min(2, style.textStroke.widthPx * 0.3)
    }px ${style.textStroke.color}`
  }
  if (style.textShadow) {
    const main = `${style.textShadow.offsetX}px ${style.textShadow.offsetY}px ${Math.min(
      12,
      style.textShadow.blur
    )}px ${style.textShadow.color}`
    const second = style.textShadow.secondary
      ? `, ${style.textShadow.secondary.offsetX}px ${style.textShadow.secondary.offsetY}px ${Math.min(
          12,
          style.textShadow.secondary.blur
        )}px ${style.textShadow.secondary.color}`
      : ''
    css.textShadow = main + second
  }
  return css
}
