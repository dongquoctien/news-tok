import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Per-word stagger with an overshoot pop — the TikTok-caption look.
 * Each word kicks in 3 frames after the previous one. Once the last word
 * has popped, it stays visible for the rest of the segment.
 */
export const WordPopText = ({ text, style, fontOverride }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const words = text.split(/\s+/).filter(Boolean)
  const perWordFrames = 3
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font, fontOverride),
        // Container can wrap; words flow naturally.
        display: 'block',
      }}
    >
      {words.map((w, i) => {
        const delay = i * perWordFrames
        const s = spring({
          frame: Math.max(0, frame - delay),
          fps,
          // Snappier than the default — TikTok-style pop reads better
          // with a higher stiffness and a clearer overshoot peak.
          config: { damping: 8, mass: 0.55, stiffness: 180 },
        })
        // Overshoot to 1.15 (was 1.05) so the bounce is visible at 30fps.
        const scale = s < 0.7 ? 0.5 + s * (1.15 - 0.5) / 0.7 : 1.15 - (s - 0.7) * 0.15 / 0.3
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: s,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              marginRight: '0.28em',
              whiteSpace: 'nowrap',
            }}
          >
            {w}
          </span>
        )
      })}
    </div>
  )
}
