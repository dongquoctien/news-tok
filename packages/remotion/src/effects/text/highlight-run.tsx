import type { CSSProperties, ReactNode } from 'react'
import type { HighlightStyle } from '@news-tok/shared/schema'
import type { TextRun } from './parse-highlight.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Render an array of `TextRun` segments with the `**highlighted**`
 * parts repainted according to `HighlightStyle`. Non-highlighted runs
 * are returned as bare `<span>`s so the parent's typography (color,
 * stroke, shadow) shows through unchanged.
 *
 * Why a dedicated component instead of inlining into every primitive:
 *   - 22 motion primitives share the same "paint the **bold** part
 *     differently" rule. Putting it in one place avoids 22 copies
 *     drifting out of sync.
 *   - Plate / underline / glow each need their own CSS treatment but
 *     all four read from the same `HighlightStyle` shape — keeping
 *     the branch local makes the primitive code trivial.
 *
 * Per-word primitives (KaraokeText, WordPopText, …) don't use this;
 * they walk a `wordMask: boolean[]` instead and call `highlightCss()`
 * below for each highlighted token.
 */
export function HighlightedRun({
  runs,
  highlight,
}: {
  runs: TextRun[]
  /** When absent, runs render as plain spans (legacy behaviour). */
  highlight?: HighlightStyle
}): ReactNode {
  const r = useResponsive()
  return (
    <>
      {runs.map((run, i) =>
        run.highlighted && highlight ? (
          <span key={i} style={highlightCss(highlight, r.unit)}>
            {run.text}
          </span>
        ) : (
          <span key={i}>{run.text}</span>
        )
      )}
    </>
  )
}

/**
 * CSS fragment that paints a single highlighted span. Exported so
 * per-word primitives can apply it inline to specific word `<span>`s
 * without re-implementing the bgStyle switch.
 *
 * `unit` is the responsive scale factor (1 at 9:16 base, > 1 on 16:9)
 * — keeps padding / radius proportional across aspect ratios.
 */
export function highlightCss(highlight: HighlightStyle, unit: number): CSSProperties {
  const css: CSSProperties = {
    // boxDecorationBreak makes plate / underline wrap nicely across
    // line breaks instead of leaving a square hole on the second line.
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  }
  if (highlight.color) css.color = highlight.color
  if (highlight.fontWeight != null) css.fontWeight = highlight.fontWeight
  if (highlight.italic) css.fontStyle = 'italic'

  // Padding only makes sense for plate; the other modes paint
  // without insetting the text, so leaving padding at 0 keeps the
  // visual aligned with the rest of the headline.
  const padBase = unit * 16 // matches TextBlock plate sizing
  const padding = (highlight.paddingPct / 100) * padBase * 4

  switch (highlight.bgStyle) {
    case 'plate':
      if (highlight.bgColor) css.background = highlight.bgColor
      css.padding = `${padding * 0.25}px ${padding}px`
      css.borderRadius = highlight.radiusPx
      // Tighten the margin so consecutive highlighted spans don't
      // overlap the surrounding text.
      css.marginRight = 4 * unit
      break
    case 'underline':
      // Thicker underline scaled with the headline so it reads at
      // thumbnail size; offset so it sits below the descenders.
      css.textDecoration = 'underline'
      css.textDecorationColor = highlight.bgColor ?? highlight.color ?? 'currentColor'
      css.textDecorationThickness = `${Math.max(2, 4 * unit)}px`
      css.textUnderlineOffset = `${4 * unit}px`
      break
    case 'glow': {
      // Layered shadow gives a soft halo without doubling the
      // typography weight. Drop intensity slightly when the highlight
      // colour is dark so the glow stays visible on dark backgrounds.
      const halo = highlight.bgColor ?? highlight.color ?? '#ffd54a'
      css.textShadow = [
        `0 0 ${8 * unit}px ${halo}`,
        `0 0 ${18 * unit}px ${halo}`,
        `0 0 ${32 * unit}px ${halo}`,
      ].join(', ')
      break
    }
    case 'none':
      // Only the typography overrides (color / weight / italic)
      // already set above apply. Nothing else to do.
      break
  }
  return css
}
