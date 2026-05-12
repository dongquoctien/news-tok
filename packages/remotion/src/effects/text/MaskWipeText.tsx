import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Diagonal clip-path wipe — text appears behind a slanted edge. CSS:
 *   clip-path: polygon(...) — animated via interpolate.
 * Produces a stronger reveal than gradientWipe for hero headlines.
 */
export const MaskWipeText = ({ text, style }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const inFrames = Math.max(1, Math.round(style.enterDurationSec * fps))
  const t = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const eased = 1 - Math.pow(1 - t, 2.5)
  // Diagonal sweep from top-left to bottom-right. The wipe edge slides
  // off the right edge of the element as `eased` goes 0 → 1.
  const edge = (1 - eased) * 120 // 0..120% to cover the slant
  const clip = `polygon(0 0, ${100 + 20 - edge}% 0, ${100 - edge}% 100%, 0 100%)`
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font),
        clipPath: clip,
        WebkitClipPath: clip,
      }}
    >
      {text}
    </div>
  )
}
