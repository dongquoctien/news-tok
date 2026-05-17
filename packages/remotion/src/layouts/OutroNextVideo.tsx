import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { ChevronUp } from 'lucide-react'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * OutroNextVideo — swipe-up tease for the next clip.
 *
 * Composition:
 *   - Background photo (segment.visuals.background) of the next
 *     video subject — full-bleed with a heavy bottom darken so the
 *     CTA copy reads. Falls back to a brand gradient when no
 *     background is set.
 *   - Top-left small NEWSTOKVN logo + handle for brand recall.
 *   - Centered "VIDEO TIẾP THEO" eyebrow.
 *   - Big bold teaser text below (segment.text), e.g. "VTV Bão số
 *     5 đổi hướng đột ngột".
 *   - Bottom: a triple-stacked chevron-up that bounces, with "Vuốt
 *     lên xem ngay" caption below it.
 *
 * Slot mapping:
 *   - media (optional) — full-bleed teaser still.
 *   - eyebrow (optional) — override "VIDEO TIẾP THEO".
 *   - text (required) — teaser headline.
 *   - fileId (optional) — handle override (default "@newstokvn").
 *   - chips — not used.
 */
export function OutroNextVideo({
  text,
  eyebrow,
  fileId,
  segment,
  brandLogoUrl,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const fadeIn = spring({ frame, fps, config: { damping: 14 } })

  // Three chevrons bouncing in a wave. Each is offset 6 frames so
  // the eye reads "up, up, up" not a solid blob. The bounce uses a
  // simple sin curve clamped to a 60-frame loop.
  const chevronOffset = (idx: number) => {
    const t = ((frame - idx * 6) % 60) / 60
    return {
      y: -Math.sin(t * Math.PI) * 32 * r.unit,
      opacity: 0.4 + Math.sin(t * Math.PI) * 0.6,
    }
  }

  const tag = (eyebrow || 'VIDEO TIẾP THEO').toUpperCase()
  const handle = fileId || '@newstokvn'

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {/* Background photo — if no media, draw a brand gradient instead. */}
      {media ? (
        <Img
          src={media.path}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // Slight zoom-in over the outro length so it feels alive
            // even at a single still.
            transform: `scale(${1.05 + (frame / fps) * 0.01})`,
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(circle at 50% 40%, #2a1856 0%, #14092a 60%, #0b0b0f 100%)',
          }}
        />
      )}

      {/* Heavy bottom darken — teaser CTA needs to win against any
          background. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 30%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0.97) 100%)',
        }}
      />

      {/* Top-left logo + handle. */}
      <div
        style={{
          position: 'absolute',
          top: 56 * r.unit,
          left: 56 * r.unit,
          display: 'flex',
          alignItems: 'center',
          gap: 14 * r.unit,
          transform: `translateY(${(1 - fadeIn) * -20}px)`,
          opacity: fadeIn,
        }}
      >
        <div
          style={{
            width: 64 * r.unit,
            height: 64 * r.unit,
            borderRadius: '50%',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
          }}
        >
          <Img
            src={brandLogoUrl || '/public/newstokvn-logo.png'}
            style={{ width: '88%', height: '88%', objectFit: 'contain' }}
          />
        </div>
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 26 * r.font,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: 1,
            textShadow: '0 2px 8px rgba(0,0,0,0.55)',
          }}
        >
          {handle}
        </span>
      </div>

      {/* "VIDEO TIẾP THEO" red eyebrow chip — top-center. */}
      <div
        style={{
          position: 'absolute',
          top: 220 * r.unit,
          left: '50%',
          transform: `translateX(-50%) translateY(${(1 - fadeIn) * -16}px)`,
          opacity: fadeIn,
          padding: `${10 * r.unit}px ${22 * r.unit}px`,
          background: '#dc2626',
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 24 * r.font,
          fontWeight: 900,
          letterSpacing: 4,
          textTransform: 'uppercase',
          borderRadius: 4,
          boxShadow: '0 6px 18px rgba(220,38,38,0.5)',
        }}
      >
        {tag}
      </div>

      {/* Teaser headline — center-aligned, big bold. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          top: '38%',
          textAlign: 'center',
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 72 * r.font,
          fontWeight: 900,
          lineHeight: 1.08,
          color: '#ffffff',
          transform: `translateY(${(1 - fadeIn) * 30}px)`,
          opacity: fadeIn,
          textShadow: '0 4px 22px rgba(0,0,0,0.85)',
          wordBreak: 'break-word',
        }}
      >
        {text || 'Đừng bỏ lỡ tin tiếp theo'}
      </div>

      {/* Triple bouncing chevron + swipe-up CTA — bottom of frame. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 200 * r.unit,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12 * r.unit,
        }}
      >
        <div style={{ position: 'relative', width: 80 * r.unit, height: 180 * r.unit }}>
          {[0, 1, 2].map((i) => {
            const c = chevronOffset(i)
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: i * 36 * r.unit,
                  display: 'flex',
                  justifyContent: 'center',
                  transform: `translateY(${c.y}px)`,
                  opacity: c.opacity,
                }}
              >
                <ChevronUp
                  size={84 * r.unit}
                  strokeWidth={3}
                  color="#ffffff"
                  style={{
                    filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.6))',
                  }}
                />
              </div>
            )
          })}
        </div>
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 34 * r.font,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: 1,
            textShadow: '0 4px 14px rgba(0,0,0,0.65)',
          }}
        >
          Vuốt lên xem ngay
        </span>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
