import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Flame } from 'lucide-react'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnIntroMarquee — high-energy "breaking news" channel intro.
 *
 * Composition:
 *   - Top: pulsing red chip "CẬP NHẬT LIÊN TỤC" (or eyebrow override).
 *   - Center: NEWSTOKVN logo, slight slide-in from below.
 *   - Headline: slides in from the left in two beats so a long
 *     headline reads as a marquee rather than a wall of type.
 *   - Bottom-right: solid red "BREAKING NEWS 24/7" chip, sticks.
 *   - Bottom-left: flame icon + "TIN NÓNG" caption pair.
 *
 * Better for live-news / event coverage segments where the energy is
 * "tin đang chạy" rather than the more editorial IntroCover.
 *
 * Slot mapping:
 *   - text (required) — headline, split on "·" or "•" so each phrase
 *     animates in on its own beat.
 *   - eyebrow (optional) — top pulsing chip text. Default
 *     "CẬP NHẬT LIÊN TỤC".
 *   - fileId (optional) — bottom-right chip text. Default
 *     "BREAKING NEWS 24/7".
 *   - media — ignored.
 */
export function NewstokvnIntroMarquee({
  text,
  eyebrow,
  fileId,
  segment,
  brandLogoUrl,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const narration = segment.audio?.narration

  // Top chip — slow 1.2s pulse so it reads as "live", not "broken".
  const pulse = interpolate(
    Math.sin((frame / 36) * Math.PI * 2),
    [-1, 1],
    [0.82, 1]
  )

  // Logo + chips + bolts staggered cascade.
  const logoIn = spring({ frame, fps, config: { damping: 14 } })
  const breakingChipIn = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 11 },
  })
  const flameIn = spring({
    frame: Math.max(0, frame - 24),
    fps,
    config: { damping: 12 },
  })

  // Marquee headline — split on bullets / dots and stagger each
  // phrase 8 frames apart. Each phrase slides in from -120px.
  const phrases = (text || 'TIN NHANH · PHÁP LUẬT · KHOA HỌC')
    .toUpperCase()
    .split(/\s*[·•]\s*/)
    .filter(Boolean)

  const phraseIn = (idx: number) => {
    const delay = 6 + idx * 8
    const t = interpolate(frame, [delay, delay + 14], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    return t
  }

  const topChipText = (eyebrow || 'CẬP NHẬT LIÊN TỤC').toUpperCase()
  const breakingText = (fileId || 'BREAKING NEWS 24/7').toUpperCase()

  return (
    <AbsoluteFill
      style={{
        // Slightly more saturated than IntroCover — this intro wants
        // to feel like a live broadcast bumper, not a magazine cover.
        background:
          'linear-gradient(160deg, #581c87 0%, #2e1065 50%, #1a0533 100%)',
      }}
    >
      {/* Subtle vertical scanlines for broadcast feel. */}
      <AbsoluteFill
        style={{
          opacity: 0.06,
          background:
            'repeating-linear-gradient(180deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 4px)',
        }}
      />

      {/* Top "CẬP NHẬT LIÊN TỤC" chip — pulses subtly. */}
      <div
        style={{
          position: 'absolute',
          top: 110 * r.unit,
          left: '50%',
          transform: `translateX(-50%) scale(${pulse})`,
          padding: `${14 * r.unit}px ${28 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 28 * r.font,
          fontWeight: 900,
          letterSpacing: 4,
          textTransform: 'uppercase',
          borderRadius: 999,
          boxShadow: '0 14px 36px rgba(239,68,68,0.55)',
        }}
      >
        {topChipText}
      </div>

      {/* Logo center, slight slide-in. */}
      <div
        style={{
          position: 'absolute',
          top: 280 * r.unit,
          left: '50%',
          width: 340 * r.unit,
          height: 340 * r.unit,
          transform: `translateX(-50%) translateY(${(1 - logoIn) * 40}px)`,
          opacity: logoIn,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          boxShadow:
            '0 0 64px rgba(168,85,247,0.5), 0 16px 40px rgba(0,0,0,0.5)',
        }}
      >
        <Img
          src={brandLogoUrl || '/public/newstokvn-logo.png'}
          style={{ width: '86%', height: '86%', objectFit: 'contain' }}
        />
      </div>

      {/* Marquee headline — each phrase slides in from left on its
          own beat. Centered horizontally. */}
      <div
        style={{
          position: 'absolute',
          top: 720 * r.unit,
          left: 56 * r.unit,
          right: 56 * r.unit,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16 * r.unit,
        }}
      >
        {phrases.map((phrase, i) => {
          const p = phraseIn(i)
          return (
            <div
              key={i}
              style={{
                fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
                fontSize: 56 * r.font,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: 1,
                color: '#ffffff',
                textShadow:
                  '0 0 24px rgba(168,85,247,0.65), 0 4px 18px rgba(0,0,0,0.65)',
                opacity: p,
                transform: `translateX(${(1 - p) * -120}px)`,
                whiteSpace: 'nowrap',
              }}
            >
              {phrase}
            </div>
          )
        })}
      </div>

      {/* Bottom-left: flame + TIN NÓNG label. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          bottom: 110 * r.unit,
          display: 'flex',
          alignItems: 'center',
          gap: 12 * r.unit,
          opacity: flameIn,
          transform: `translateY(${(1 - flameIn) * 20}px)`,
        }}
      >
        <Flame
          size={48 * r.unit}
          strokeWidth={2.4}
          color="#facc15"
          fill="#facc15"
        />
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 30 * r.font,
            fontWeight: 900,
            color: '#facc15',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Tin nóng
        </span>
      </div>

      {/* Bottom-right: red "BREAKING NEWS 24/7" chip. */}
      <div
        style={{
          position: 'absolute',
          right: 56 * r.unit,
          bottom: 110 * r.unit,
          padding: `${14 * r.unit}px ${22 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)',
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 26 * r.font,
          fontWeight: 900,
          letterSpacing: 2,
          textTransform: 'uppercase',
          borderRadius: 8,
          boxShadow: '0 10px 28px rgba(239,68,68,0.55)',
          transform: `scale(${0.7 + breakingChipIn * 0.3})`,
          opacity: breakingChipIn,
        }}
      >
        {breakingText}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
