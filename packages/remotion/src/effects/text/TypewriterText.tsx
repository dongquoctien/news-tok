import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Reveals the text character-by-character, sized so the whole string
 * completes around `style.enterDurationSec`. Reuses the visual pattern
 * of `effects/Typewriter.tsx` but accepts a TextStyle for typography.
 */
export const TypewriterText = ({ text, style, fontOverride, colorOverride }: TextPrimitiveProps) => {
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
  const slice = text.slice(0, Math.max(0, Math.min(totalChars, visible)))
  const showCaret = visible < totalChars
  return (
    <div style={typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride)}>
      {slice}
      {showCaret ? (
        <span style={{ opacity: frame % fps < fps / 2 ? 1 : 0 }}>|</span>
      ) : null}
    </div>
  )
}
