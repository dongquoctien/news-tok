import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Each word flips from flat (rotateX 90deg) to upright. CSS equivalent:
 *   .word { transform: perspective(800px) rotateX(90deg); opacity: 0 }
 *   .word.in { transform: rotateX(0); opacity: 1 }
 * Per-word stagger reads as a card-flip cascade.
 */
export const WordReveal3dText = ({ text, style, fontOverride }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const words = text.split(/\s+/).filter(Boolean)
  const perWordFrames = 4
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font, fontOverride),
        // perspective applied on the container so child transforms share
        // the same vanishing point.
        perspective: '800px',
      }}
    >
      {words.map((w, i) => {
        const delay = i * perWordFrames
        const s = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 10, mass: 0.55, stiffness: 170 },
        })
        const rotateX = (1 - s) * -90
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: s,
              transformOrigin: '50% 100%',
              transform: `rotateX(${rotateX}deg)`,
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
