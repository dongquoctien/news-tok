import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Per-word stagger with an overshoot pop — the TikTok-caption look.
 * Each word kicks in 3 frames after the previous one. Once the last word
 * has popped, it stays visible for the rest of the segment.
 */
export const WordPopText = ({ text, style }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const words = text.split(/\s+/).filter(Boolean)
  const perWordFrames = 3
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font),
        // Container can wrap; words flow naturally.
        display: 'block',
      }}
    >
      {words.map((w, i) => {
        const delay = i * perWordFrames
        const s = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 10, mass: 0.6 },
        })
        const scale = s < 0.7 ? 0.5 + s * (1.05 - 0.5) / 0.7 : 1.05 - (s - 0.7) * 0.05 / 0.3
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
