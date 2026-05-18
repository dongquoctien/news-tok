import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'
import { HighlightedRun } from './highlight-run.js'

export const ScaleInText = ({
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
  // Snappier overshoot — the original mass=0.8 + no stiffness made the
  // bounce melt away before it landed. Lower mass + higher stiffness
  // peaks 1.12 before settling to 1.0.
  const s = spring({ frame, fps, config: { damping: 9, mass: 0.55, stiffness: 170 } })
  const scale = s < 0.7 ? 1.5 - s * (1.5 - 1.12) / 0.7 : 1.12 - (s - 0.7) * 0.12 / 0.3
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride),
        opacity: s,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {parts && highlightStyle ? <HighlightedRun runs={parts} highlight={highlightStyle} /> : text}
    </div>
  )
}
