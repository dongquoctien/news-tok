import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Reveals the text behind a gradient mask that wipes left → right over
 * `style.enterDurationSec`. Requires `style.gradientFill`; without it,
 * falls back to a plain fade so the segment still renders something.
 */
export const GradientWipeText = ({
  text,
  style,
  fontOverride,
  colorOverride,
}: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const inFrames = Math.max(1, Math.round(style.enterDurationSec * fps))
  const progress = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const css = typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride)
  // Use clip-path to wipe a vertical band from left to right.
  const clip = `inset(0 ${(1 - progress) * 100}% 0 0)`
  return (
    <div style={{ ...css, clipPath: clip, WebkitClipPath: clip }}>
      {text}
    </div>
  )
}
