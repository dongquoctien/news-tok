import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'
import { highlightCss } from './highlight-run.js'

/**
 * Reveals the text character-by-character, sized so the whole string
 * completes around `style.enterDurationSec`. Reuses the visual pattern
 * of `effects/Typewriter.tsx` but accepts a TextStyle for typography.
 */
export const TypewriterText = ({
  text,
  parts,
  highlightStyle,
  style,
  fontOverride,
  colorOverride,
}: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const totalChars = text.length
  const framesToFull = Math.max(1, Math.round(style.enterDurationSec * fps * Math.max(1, totalChars / 24)))
  const visible = Math.round(
    interpolate(frame, [0, framesToFull], [0, totalChars], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const visibleClamped = Math.max(0, Math.min(totalChars, visible))
  const showCaret = visible < totalChars
  return (
    <div style={typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride)}>
      {parts && highlightStyle
        ? renderTypewriterParts(parts, visibleClamped, highlightStyle, r.unit)
        : text.slice(0, visibleClamped)}
      {showCaret ? (
        <span style={{ opacity: frame % fps < fps / 2 ? 1 : 0 }}>|</span>
      ) : null}
    </div>
  )
}

/**
 * Walk the parts array slicing each chunk so the running total of
 * characters equals `visibleChars`. Highlighted runs render their slice
 * through `highlightCss` so the plate / underline / glow appears as the
 * cursor passes through.
 */
function renderTypewriterParts(
  parts: NonNullable<TextPrimitiveProps['parts']>,
  visibleChars: number,
  highlightStyle: NonNullable<TextPrimitiveProps['highlightStyle']>,
  unit: number
): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let remaining = visibleChars
  parts.forEach((p, i) => {
    if (remaining <= 0) return
    const take = Math.min(p.text.length, remaining)
    const chunk = p.text.slice(0, take)
    remaining -= take
    if (p.highlighted) {
      out.push(
        <span key={i} style={highlightCss(highlightStyle, unit)}>
          {chunk}
        </span>
      )
    } else {
      out.push(<span key={i}>{chunk}</span>)
    }
  })
  return out
}
