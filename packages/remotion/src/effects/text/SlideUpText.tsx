import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'
import { HighlightedRun } from './highlight-run.js'

export const SlideUpText = ({
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
  const s = spring({ frame, fps, config: { damping: 14 } })
  const offset = (1 - s) * 60
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride),
        opacity: s,
        transform: `translateY(${offset}px)`,
      }}
    >
      {parts && highlightStyle ? <HighlightedRun runs={parts} highlight={highlightStyle} /> : text}
    </div>
  )
}
