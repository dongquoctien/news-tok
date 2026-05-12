import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'

/**
 * Cinematic-style "fade from blur" reveal. CSS equivalent would be
 *   @keyframes blurIn { 0% { filter: blur(20px); opacity: 0 }
 *                       100% { filter: blur(0); opacity: 1 } }
 * The motion is ported here using interpolate + the current frame so
 * each rendered frame is deterministic.
 */
export const BlurRevealText = ({
  text,
  style,
  fontOverride,
  colorOverride,
}: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const inFrames = Math.max(1, Math.round(style.enterDurationSec * fps))
  const t = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  // Ease-out cubic for a softer landing.
  const eased = 1 - Math.pow(1 - t, 3)
  const blur = (1 - eased) * 20
  return (
    <div
      style={{
        ...typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride),
        opacity: eased,
        filter: `blur(${blur}px)`,
      }}
    >
      {text}
    </div>
  )
}
