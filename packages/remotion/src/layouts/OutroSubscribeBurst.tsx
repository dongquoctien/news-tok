import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Bell, ThumbsUp } from 'lucide-react'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * OutroSubscribeBurst — high-energy end-card.
 *
 * Composition:
 *   - Big centered NEWSTOKVN logo with a ring that pulses outward in
 *     2 staggered waves (signals "tap me").
 *   - Red rounded "NHẤN THEO DÕI" button that springs in below the
 *     logo, with a thumbs-up + bell icon that fly in from the sides
 *     after the button settles.
 *   - Optional caption from segment.text underneath (e.g. "Cảm ơn
 *     đã xem"). Eyebrow becomes the small tag above the logo
 *     (defaults to "@newstokvn").
 *
 * Reasoning behind the choices:
 *   - The pulsing rings are the proven "subscribe-CTA" affordance
 *     TikTok/Reels creators use; reads as motion at the bottom of
 *     the viewer's attention curve when the next video is about to
 *     autoplay.
 *   - The icons fly in *after* the button so the eye has time to
 *     read CTA copy first — chrome that arrives before content is
 *     visual noise.
 *   - No media slot: outros are brand-led, not photo-led.
 */
export function OutroSubscribeBurst({
  text,
  eyebrow,
  segment,
  brandLogoUrl,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const narration = segment.audio?.narration

  // Logo entrance — quick spring scale + fade. Drives the entire
  // composition timing so downstream elements stagger off this.
  const logoIn = spring({ frame, fps, config: { damping: 12 } })

  // Two pulse rings, offset 30 frames apart, repeating every 60 frames.
  // Each ring grows from scale 0.9 → 1.6 and fades 0.55 → 0.
  const pulse = (offset: number) => {
    const t = ((frame - offset) % 60) / 60
    return {
      scale: interpolate(t, [0, 1], [0.9, 1.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      opacity: interpolate(t, [0, 1], [0.55, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    }
  }
  const ring1 = pulse(0)
  const ring2 = pulse(30)

  // Button spring with 18-frame delay so the logo is settled first.
  const buttonIn = spring({ frame: Math.max(0, frame - 18), fps, config: { damping: 11 } })

  // Icons fly in once the button is mostly there. ThumbsUp from the
  // left, Bell from the right, each on its own slight delay so they
  // don't read as a synchronous pair.
  const thumbsIn = spring({ frame: Math.max(0, frame - 36), fps, config: { damping: 14 } })
  const bellIn = spring({ frame: Math.max(0, frame - 42), fps, config: { damping: 14 } })

  // Optional caption fades in last.
  const captionIn = interpolate(frame, [50, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const handle = eyebrow || '@newstokvn'
  const caption = text || 'Cảm ơn đã xem!'

  return (
    <AbsoluteFill
      style={{
        // Brand-coloured radial — soft purple → near-black. Matches
        // the NEWSTOKVN logo's hue so the logo doesn't fight the bg.
        background:
          'radial-gradient(circle at 50% 42%, #2a1856 0%, #14092a 55%, #0b0b0f 100%)',
      }}
    >
      {/* Subtle noise-less dot texture for depth — radial-gradient
          stripes are deterministic across frames. */}
      <AbsoluteFill
        style={{
          opacity: 0.18,
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: `${24 * r.unit}px ${24 * r.unit}px`,
        }}
      />

      {/* Eyebrow handle pill, top of the layout. */}
      <div
        style={{
          position: 'absolute',
          top: 200 * r.unit,
          left: '50%',
          transform: `translateX(-50%) translateY(${(1 - logoIn) * 20}px)`,
          opacity: logoIn,
          padding: `${10 * r.unit}px ${22 * r.unit}px`,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 999,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 26 * r.font,
          fontWeight: 700,
          color: '#e9d5ff',
          letterSpacing: 1,
        }}
      >
        {handle}
      </div>

      {/* Logo + concentric pulse rings — center of the frame. */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) translateY(${-40 * r.unit}px)`,
          width: 480 * r.unit,
          height: 480 * r.unit,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {[ring1, ring2].map((rng, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `${4 * r.unit}px solid #a855f7`,
              transform: `scale(${rng.scale})`,
              opacity: rng.opacity * logoIn,
              boxShadow: '0 0 60px rgba(168,85,247,0.45)',
            }}
          />
        ))}
        <div
          style={{
            width: 360 * r.unit,
            height: 360 * r.unit,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.96)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${0.85 + logoIn * 0.15})`,
            opacity: logoIn,
            boxShadow: '0 24px 72px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          <Img
            src={brandLogoUrl || '/public/newstokvn-logo.png'}
            style={{ width: '88%', height: '88%', objectFit: 'contain' }}
          />
        </div>
      </div>

      {/* "NHẤN THEO DÕI" red CTA button — springs in below the logo. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 320 * r.unit,
          transform: `translateX(-50%) scale(${0.6 + buttonIn * 0.4})`,
          opacity: buttonIn,
          padding: `${22 * r.unit}px ${52 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
          color: '#ffffff',
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 40 * r.font,
          fontWeight: 900,
          letterSpacing: 2,
          textTransform: 'uppercase',
          borderRadius: 14,
          boxShadow:
            '0 12px 36px rgba(239,68,68,0.55), 0 0 0 4px rgba(239,68,68,0.18)',
          whiteSpace: 'nowrap',
        }}
      >
        NHẤN THEO DÕI
      </div>

      {/* Floating icons left + right of the button. */}
      <div
        style={{
          position: 'absolute',
          left: 96 * r.unit,
          bottom: 350 * r.unit,
          transform: `translate(${(1 - thumbsIn) * -80}px, 0) rotate(${-15 + thumbsIn * 15}deg)`,
          opacity: thumbsIn,
        }}
      >
        <div
          style={{
            width: 96 * r.unit,
            height: 96 * r.unit,
            borderRadius: '50%',
            background: '#facc15',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 28px rgba(250,204,21,0.45)',
          }}
        >
          <ThumbsUp size={56 * r.unit} strokeWidth={2.5} color="#1f0f00" />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 96 * r.unit,
          bottom: 350 * r.unit,
          transform: `translate(${(1 - bellIn) * 80}px, 0) rotate(${15 - bellIn * 15}deg)`,
          opacity: bellIn,
        }}
      >
        <div
          style={{
            width: 96 * r.unit,
            height: 96 * r.unit,
            borderRadius: '50%',
            background: '#22d3ee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 28px rgba(34,211,238,0.45)',
          }}
        >
          <Bell size={56 * r.unit} strokeWidth={2.5} color="#001316" />
        </div>
      </div>

      {/* Caption — fades in last. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 180 * r.unit,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 36 * r.font,
          fontWeight: 600,
          color: '#ffffff',
          textAlign: 'center',
          opacity: captionIn,
          textShadow: '0 4px 14px rgba(0,0,0,0.65)',
        }}
      >
        {caption}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
