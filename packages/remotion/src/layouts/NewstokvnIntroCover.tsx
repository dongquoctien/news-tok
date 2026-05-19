import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Zap } from 'lucide-react'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnIntroCover — opening "channel cover" intro.
 *
 * Mirrors the NEWSTOKVN brand banner: deep purple radial bg, big bold
 * caps headline ("TIN NHANH • PHÁP LUẬT • KHOA HỌC" by default but
 * driven by `text`), centered NEWSTOKVN logo with a spring zoom-in,
 * tagline below in lavender, and two lightning bolts flanking the
 * logo that fade in after it lands.
 *
 * Slot mapping:
 *   - text (required) — headline, will be UPPER-CASED for display.
 *     Use • between phrases for the banner-style separator.
 *   - eyebrow (optional) — tagline below the logo. Defaults
 *     "TIN NÓNG HỔI - CẬP NHẬT LIÊN TỤC - ĐÚNG, NHANH, ĐÁNG TIN CẬY".
 *   - media — ignored. This is a brand-led cover; a photo behind the
 *     logo would fight the purple radial.
 */
export function NewstokvnIntroCover({
  text,
  eyebrow,
  segment,
  brandLogoUrl,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const narration = segment.audio?.narration

  // Logo lands first (spring), headline + tagline cascade after.
  const logoIn = spring({ frame, fps, config: { damping: 13 } })
  const headlineIn = spring({
    frame: Math.max(0, frame - 12),
    fps,
    config: { damping: 14 },
  })
  const taglineIn = interpolate(frame, [24, 48], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Two lightning bolts at the headline corners; arrive ~0.7s in and
  // settle. Slight rotation reads as energy without distracting from
  // the type.
  const boltLeftIn = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 11 },
  })
  const boltRightIn = spring({
    frame: Math.max(0, frame - 24),
    fps,
    config: { damping: 11 },
  })

  const tagline =
    eyebrow || 'TIN NÓNG HỔI · CẬP NHẬT LIÊN TỤC · ĐÚNG NHANH ĐÁNG TIN CẬY'

  return (
    <AbsoluteFill
      style={{
        // Brand radial — matches the banner cover hue exactly so a
        // viewer scrolling past recognises the channel before the
        // headline finishes typing.
        background:
          'radial-gradient(circle at 50% 38%, #4c1d95 0%, #2e1065 55%, #0b0314 100%)',
      }}
    >
      {/* Soft top glow — sells the "spotlit" feel above the logo. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% 28%, rgba(168,85,247,0.35) 0%, transparent 55%)',
        }}
      />
      {/* Diagonal speed-streaks (purely decorative — repeating linear
          gradients keep the bundle small vs an animated svg). */}
      <AbsoluteFill
        style={{
          opacity: 0.08,
          background:
            'repeating-linear-gradient(105deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 80px)',
        }}
      />

      {/* Centered logo with two lightning bolts at the headline
          baseline (positioned absolutely so they don't shift the
          headline's centering when they animate in). */}
      <div
        style={{
          position: 'absolute',
          top: 360 * r.unit,
          left: '50%',
          width: 380 * r.unit,
          height: 380 * r.unit,
          transform: `translateX(-50%) translateY(${(1 - logoIn) * 40}px) scale(${0.7 + logoIn * 0.3})`,
          opacity: logoIn,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.94)',
            boxShadow:
              '0 0 80px rgba(168,85,247,0.65), 0 24px 60px rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Img
            src={brandLogoUrl || '/public/newstokvn-logo.png'}
            style={{ width: '86%', height: '86%', objectFit: 'contain' }}
          />
        </div>
      </div>

      {/* Lightning bolt — left of the headline. */}
      <div
        style={{
          position: 'absolute',
          top: 880 * r.unit,
          left: 56 * r.unit,
          transform: `translateY(${(1 - boltLeftIn) * 30}px) rotate(${-12 - (1 - boltLeftIn) * 25}deg)`,
          opacity: boltLeftIn,
        }}
      >
        <Zap
          size={92 * r.unit}
          strokeWidth={2.5}
          color="#facc15"
          fill="#facc15"
          style={{ filter: 'drop-shadow(0 6px 18px rgba(250,204,21,0.55))' }}
        />
      </div>
      {/* Lightning bolt — right of the headline, mirror rotation. */}
      <div
        style={{
          position: 'absolute',
          top: 880 * r.unit,
          right: 56 * r.unit,
          transform: `translateY(${(1 - boltRightIn) * 30}px) rotate(${12 + (1 - boltRightIn) * 25}deg)`,
          opacity: boltRightIn,
        }}
      >
        <Zap
          size={92 * r.unit}
          strokeWidth={2.5}
          color="#facc15"
          fill="#facc15"
          style={{ filter: 'drop-shadow(0 6px 18px rgba(250,204,21,0.55))' }}
        />
      </div>

      {/* Headline — centered, big bold caps, gradient text fill so it
          pops against the deep purple bg. */}
      <div
        style={{
          position: 'absolute',
          top: 880 * r.unit,
          left: 180 * r.unit,
          right: 180 * r.unit,
          textAlign: 'center',
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 30}px)`,
        }}
      >
        <div
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 64 * r.font,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: 1,
            textTransform: 'uppercase',
            background:
              'linear-gradient(180deg, #ffffff 0%, #ede9fe 60%, #c4b5fd 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 4px 24px rgba(168,85,247,0.45)',
          }}
        >
          {text || 'TIN NHANH · PHÁP LUẬT · KHOA HỌC'}
        </div>
      </div>

      {/* Tagline — fades in last; lavender so it reads as
          secondary copy beneath the gradient headline. */}
      <div
        style={{
          position: 'absolute',
          bottom: 280 * r.unit,
          left: 56 * r.unit,
          right: 56 * r.unit,
          textAlign: 'center',
          opacity: taglineIn,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 28 * r.font,
          fontWeight: 600,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: '#c4b5fd',
        }}
      >
        {tagline}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
