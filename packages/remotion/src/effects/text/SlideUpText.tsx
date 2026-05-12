import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

export const SlideUpText = ({ text, style }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const s = spring({ frame, fps, config: { damping: 14 } })
  const offset = (1 - s) * 60
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font),
        opacity: s,
        transform: `translateY(${offset}px)`,
      }}
    >
      {text}
    </div>
  )
}
