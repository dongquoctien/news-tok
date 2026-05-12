import { useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Per-character sine-wave bounce. CSS equivalent:
 *   @keyframes bounce { 0%,100% { translateY: 0 } 50% { translateY: -8px } }
 *   .char:nth-child(n) { animation-delay: calc(n * 80ms) }
 * Driven by frame so the wave never freezes when scrubbed.
 */
export const WaveBounceText = ({ text, style, fontOverride }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  // Iterate over codepoints so VN diacritics ride with the base letter.
  const chars = [...text]
  const amplitudePx = 0.06 * style.fontSize * r.font
  const wavePeriodFrames = Math.max(8, Math.round(fps * 0.6))
  const perCharOffset = 3 // frames between adjacent chars
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font, fontOverride),
        whiteSpace: 'pre',
      }}
    >
      {chars.map((c, i) => {
        if (c === '\n' || c === ' ') return <span key={i}>{c}</span>
        const local = frame - i * perCharOffset
        const phase = (local / wavePeriodFrames) * Math.PI * 2
        const y = Math.sin(phase) * amplitudePx
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translateY(${y}px)`,
            }}
          >
            {c}
          </span>
        )
      })}
    </div>
  )
}
