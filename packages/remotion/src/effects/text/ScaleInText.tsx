import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

export const ScaleInText = ({ text, style }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const s = spring({ frame, fps, config: { damping: 10, mass: 0.8 } })
  // Overshoot: scale 1.5 → 1.05 → 1.
  const scale = s < 0.7 ? 1.5 - s * (1.5 - 1.05) / 0.7 : 1.05 - (s - 0.7) * 0.05 / 0.3
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font),
        opacity: s,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {text}
    </div>
  )
}
