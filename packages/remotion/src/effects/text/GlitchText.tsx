import { useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * RGB-split glitch with deterministic per-frame jitter. CSS would do this
 * via keyframes that jump offsets every few frames; we replicate that by
 * picking offsets from a small lookup keyed by `frame % N`. The result is
 * stable across re-renders (no `Math.random()`).
 */
const JITTER_X = [0, -3, 4, -2, 1, 5, -4, 2, -1, 3]
const JITTER_Y = [0, 1, -2, 0, 3, -1, 2, -3, 1, 0]
const FLICKER = [1, 1, 0.85, 1, 1, 0.9, 1, 1, 0.95, 1]

export const GlitchText = ({ text, style }: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  // Jitter advances every other frame at 30fps so it reads as motion
  // rather than a static halo — but not so fast it disappears.
  const stride = Math.max(1, Math.round(fps / 15))
  const idx = Math.floor(frame / stride) % JITTER_X.length
  const dx = JITTER_X[idx] ?? 0
  const dy = JITTER_Y[idx] ?? 0
  const flicker = FLICKER[idx] ?? 1
  const css = typographyStyle(style, style.fontSize * r.font)
  // Compose two-layer chroma shadow on top of whatever style.textShadow
  // already provides. We replace it so the glitch reads cleanly.
  const layered = `${-dx - 3}px ${dy}px 0 #ff00ea, ${dx + 3}px ${-dy}px 0 #00ffff${
    style.textShadow ? `, ${css.textShadow ?? ''}` : ''
  }`
  return (
    <div
      style={{
        ...css,
        textShadow: layered,
        opacity: flicker,
        transform: `translate(${dx * 0.4}px, ${dy * 0.4}px)`,
      }}
    >
      {text}
    </div>
  )
}
