import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Per-character cascade — each letter springs into place with a small
 * delay relative to the previous one. Good for title segments where the
 * 3-5s slot needs a longer, more deliberate intro than a 0.4s fade.
 *
 * `style.staggerStep` controls the per-char delay in seconds (default
 * 0.04s ≈ 1.2 frames @30fps). On a 50-char headline that runs the full
 * intro over ~2 seconds, then the text holds.
 *
 * Spaces are preserved as inline-block but skip the animation (they
 * collapse otherwise when wrapped in span).
 */
export const LetterStaggerText = ({
  text,
  style,
  fontOverride,
  colorOverride,
}: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const stepFrames = Math.max(1, Math.round((style.staggerStep ?? 0.04) * fps))
  const base = typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride)

  return (
    <div style={{ ...base, display: 'block' }}>
      {Array.from(text).map((ch, i) => {
        if (ch === ' ') {
          return (
            <span
              key={i}
              style={{ display: 'inline-block', width: '0.28em' }}
            >
              {' '}
            </span>
          )
        }
        const delay = i * stepFrames
        const s = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 12, mass: 0.55, stiffness: 180 },
        })
        const translateY = (1 - s) * (r.unit * 1.4)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: s,
              transform: `translateY(${translateY}px)`,
              whiteSpace: 'pre',
            }}
          >
            {ch}
          </span>
        )
      })}
    </div>
  )
}
