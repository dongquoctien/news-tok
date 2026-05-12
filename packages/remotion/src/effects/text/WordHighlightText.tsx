import { useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Renders every word, applying a coloured chip behind whichever word is
 * currently being narrated (per `wordBoundaries`). The chip colour comes
 * from `style.gradientFill.from` (a convenient single-colour knob), or
 * falls back to a neutral accent.
 */
export const WordHighlightText = ({ text, style, wordBoundaries }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const tSec = frame / fps
  const accent = style.gradientFill?.from ?? '#a5b4fc'

  // When word boundaries are missing, behave like FadeInText.
  if (!wordBoundaries || wordBoundaries.length === 0) {
    return (
      <div style={typographyStyle(style, style.fontSize * r.font)}>
        {text}
      </div>
    )
  }

  return (
    <div style={typographyStyle(style, style.fontSize * r.font)}>
      {wordBoundaries.map((w, i) => {
        const active = tSec >= w.offsetSec && tSec < w.offsetSec + w.durationSec
        return (
          <span
            key={`${w.text}-${i}`}
            style={{
              display: 'inline-block',
              marginRight: '0.28em',
              padding: active ? '0 0.18em' : 0,
              borderRadius: 6,
              background: active ? accent : 'transparent',
              color: active ? '#0b0b0f' : style.color,
              transition: 'none',
            }}
          >
            {w.text}
          </span>
        )
      })}
    </div>
  )
}
