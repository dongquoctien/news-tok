import { useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'
import { highlightCss } from './highlight-run.js'

const POOL = [
  'breaking', 'update', 'news', 'live', 'alert', 'hot', 'just-in', 'today',
  'macOS', 'iOS', 'AI', 'crypto', 'BTC', 'ETH', 'fast', 'big', 'new',
]

/**
 * Each word cycles through 5 random candidates from a small pool before
 * snapping to the real text. The randomness is deterministic (seeded by
 * word index + cycle index) so a re-render gives the same frames.
 */
export const SlotMachineText = ({
  text,
  wordHighlightMask,
  highlightStyle,
  style,
  fontOverride,
  colorOverride,
}: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const words = text.split(/\s+/).filter(Boolean)
  const cycleFramesPerWord = Math.max(2, Math.round(fps * 0.07)) // ~70ms per spin
  const cyclesPerWord = 5
  const totalSpinFramesPerWord = cycleFramesPerWord * cyclesPerWord
  // Stagger word starts so they settle in sequence.
  const wordStartStride = Math.max(3, Math.round(fps * 0.12))
  return (
    <div style={typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride)}>
      {words.map((real, i) => {
        const localFrame = frame - i * wordStartStride
        const cycleIndex = Math.floor(localFrame / cycleFramesPerWord)
        const isFlagged = highlightStyle && wordHighlightMask?.[i]
        const hcss = isFlagged ? highlightCss(highlightStyle, r.unit) : undefined
        if (localFrame < 0) {
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: '0.28em', opacity: 0 }}>
              {real}
            </span>
          )
        }
        if (cycleIndex >= cyclesPerWord) {
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: '0.28em', ...hcss }}>
              {real}
            </span>
          )
        }
        const idx = (i * 7 + cycleIndex * 13) % POOL.length
        const fake = POOL[idx]
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: '0.28em',
              opacity: 0.7,
              filter: 'blur(0.5px)',
            }}
          >
            {fake}
          </span>
        )
      })}
    </div>
  )
}
