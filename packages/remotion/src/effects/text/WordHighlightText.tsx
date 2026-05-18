import { useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'
import { highlightCss } from './highlight-run.js'

/**
 * Renders every word, applying a coloured chip behind whichever word is
 * currently being narrated (per `wordBoundaries`). The chip colour comes
 * from `style.gradientFill.from` (a convenient single-colour knob), or
 * falls back to a neutral accent.
 */
export const WordHighlightText = ({
  text,
  parts,
  wordHighlightMask,
  highlightStyle,
  style,
  wordBoundaries,
  fontOverride,
  colorOverride,
}: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const tSec = frame / fps
  // accent chip color: explicit override → style.gradientFill.from → default.
  const accent = colorOverride?.accent ?? style.gradientFill?.from ?? '#a5b4fc'
  const idleColor = colorOverride?.primary ?? style.color

  // When word boundaries are missing, behave like FadeInText (still
  // applying `**highlight**` when present).
  if (!wordBoundaries || wordBoundaries.length === 0) {
    return (
      <div style={typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride)}>
        {parts && highlightStyle
          ? parts.map((p, i) =>
              p.highlighted ? (
                <span key={i} style={highlightCss(highlightStyle, r.unit)}>{p.text}</span>
              ) : (
                <span key={i}>{p.text}</span>
              )
            )
          : text}
      </div>
    )
  }

  return (
    <div style={typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride)}>
      {wordBoundaries.map((w, i) => {
        const active = tSec >= w.offsetSec && tSec < w.offsetSec + w.durationSec
        // Karaoke chip wins visually so highlight bg only fires when
        // the word isn't currently being read. Keep color/weight/italic
        // from highlight even during the chip so the boldness stays.
        const isFlagged = highlightStyle && wordHighlightMask?.[i]
        const hcss = isFlagged ? highlightCss(highlightStyle, r.unit) : undefined
        // Karaoke chip wins visually so highlight bg only fires when the
        // word isn't currently being read. Resolve all three layers
        // (karaoke base + highlight + karaoke override) into a single
        // CSSProperties object so TS doesn't flag duplicate keys.
        const finalStyle: React.CSSProperties = {
          display: 'inline-block',
          marginRight: '0.28em',
          padding: active ? '0 0.18em' : 0,
          borderRadius: 6,
          transition: 'none',
          ...(hcss ?? {}),
        }
        if (active) {
          finalStyle.background = accent
          finalStyle.color = '#0b0b0f'
        } else if (!isFlagged) {
          finalStyle.background = 'transparent'
          finalStyle.color = idleColor
        }
        return (
          <span key={`${w.text}-${i}`} style={finalStyle}>
            {w.text}
          </span>
        )
      })}
    </div>
  )
}
