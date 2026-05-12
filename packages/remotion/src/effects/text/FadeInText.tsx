import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

export const FadeInText = ({ text, style, fontOverride, colorOverride }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const inFrames = Math.max(1, Math.round(style.enterDurationSec * fps))
  const opacity = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div style={{ ...typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride), opacity }}>
      {text}
    </div>
  )
}
