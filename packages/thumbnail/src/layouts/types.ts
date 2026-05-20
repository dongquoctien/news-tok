import type { Thumbnail, ThumbnailTextStyle } from '@news-tok/shared/schema'
import type { LayoutRecipe } from '../topic-router.js'

/**
 * Props every thumbnail layout receives. Layouts are PURE React
 * components — no Remotion hooks, no Audio, no KenBurns. They take
 * absolute pixel coordinates from `Thumbnail.edits` and paint a 1080x1920
 * surface. The same component is consumed by:
 *
 *   - Studio's editor preview (a scaled <div>)
 *   - The MCP renderStill pipeline (Remotion wrapper composition)
 *   - The `react-konva` editor canvas (rasterised through DOM)
 *
 * Layouts MUST honour the position + style fields exactly; they only own
 * the "decoration" layers (background gradient, accent plate shape, side
 * stripe) that are tied to the layout's brand identity.
 */
export type ThumbnailLayoutProps = {
  edits: Thumbnail['edits']
  background: Thumbnail['background']
  watermark: Thumbnail['watermark']
  recipe: LayoutRecipe
  /**
   * When true, the layout renders a flat HTML-friendly SVG-safe variant
   * (no CSS shadow / no advanced gradients). Studio's editor uses this
   * for the konva preview where complex CSS doesn't render correctly.
   */
  flat?: boolean
}

/** Render a text block at absolute coordinates using ThumbnailTextStyle. */
export function styleToCss(style: ThumbnailTextStyle): React.CSSProperties {
  return {
    position: 'absolute',
    left: style.x,
    top: style.y,
    width: style.width,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    color: style.color,
    backgroundColor: style.bgColor,
    textAlign: style.align,
    fontFamily: style.fontFamily ?? '"Be Vietnam Pro", Inter, sans-serif',
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    // Pad slightly when there's a background plate so the text doesn't
    // touch the plate edge.
    padding: style.bgColor ? '6px 14px' : 0,
    display: 'inline-block',
    boxSizing: 'border-box',
    wordBreak: 'break-word',
  }
}
