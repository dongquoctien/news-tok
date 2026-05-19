import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnOutroChannels — outro that surfaces the channel's beat
 * portfolio (PHÁP LUẬT / KHOA HỌC / CÔNG NGHỆ / ĐỜI SỐNG / GIẢI TRÍ)
 * underneath the brand mark so a viewer who just discovered the
 * channel can see what else lives there.
 *
 * Composition:
 *   - Top: brand purple radial bg with logo + handle "@newstokvn".
 *   - Middle: 2-row grid of category chips, staggered cascade in.
 *   - Bottom: red "THEO DÕI NGAY" CTA pill that springs in last with
 *     a subtle pulse so the eye lands there at the end.
 *
 * Slot mapping:
 *   - text (optional) — small caption under the handle, defaults
 *     "Theo dõi để không bỏ lỡ tin nóng mới nhất".
 *   - eyebrow (optional) — handle override, default "@newstokvn".
 *   - chips (optional) — category strip override. Defaults to the
 *     full NEWSTOKVN beat portfolio. Cap at 8 entries to keep the
 *     two-row grid readable.
 *   - media — ignored.
 */
export function NewstokvnOutroChannels({
  text,
  eyebrow,
  chips,
  segment,
  brandLogoUrl,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const narration = segment.audio?.narration

  // Logo + handle stagger in first.
  const headIn = spring({ frame, fps, config: { damping: 14 } })
  // Caption fade slightly after.
  const captionIn = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  // CTA button enters last + pulses.
  const ctaIn = spring({
    frame: Math.max(0, frame - 48),
    fps,
    config: { damping: 11 },
  })
  const ctaPulse = interpolate(
    Math.sin((frame / 36) * Math.PI * 2),
    [-1, 1],
    [0.97, 1.03]
  )

  const handle = (eyebrow || '@newstokvn').toLowerCase()
  const caption = text || 'Theo dõi để không bỏ lỡ tin nóng mới nhất'

  // Default category set — overridable via `chips` if a project
  // wants to spotlight a narrower beat. Cap at 8 for layout.
  const DEFAULT_CHIPS = [
    'THỜI SỰ',
    'PHÁP LUẬT',
    'KHOA HỌC',
    'CÔNG NGHỆ',
    'ĐỜI SỐNG',
    'THẾ GIỚI',
    'GIẢI TRÍ',
    'THỂ THAO',
  ]
  const categories = (chips && chips.length > 0 ? chips : DEFAULT_CHIPS)
    .slice(0, 8)
    .map((c) => c.toUpperCase())

  // Chip cascade — each chip slides in from below 4 frames apart.
  const chipIn = (idx: number) => {
    const delay = 12 + idx * 4
    return interpolate(frame, [delay, delay + 14], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 50% 32%, #4c1d95 0%, #2e1065 60%, #0b0314 100%)',
      }}
    >
      {/* Top spotlight glow behind the logo. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% 20%, rgba(168,85,247,0.35) 0%, transparent 55%)',
        }}
      />

      {/* Logo + handle block. */}
      <div
        style={{
          position: 'absolute',
          top: 240 * r.unit,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16 * r.unit,
          transform: `translateY(${(1 - headIn) * 30}px)`,
          opacity: headIn,
        }}
      >
        <div
          style={{
            width: 280 * r.unit,
            height: 280 * r.unit,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.96)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow:
              '0 0 64px rgba(168,85,247,0.55), 0 16px 40px rgba(0,0,0,0.6)',
          }}
        >
          <Img
            src={brandLogoUrl || '/public/newstokvn-logo.png'}
            style={{ width: '86%', height: '86%', objectFit: 'contain' }}
          />
        </div>
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 44 * r.font,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: 1,
            textShadow: '0 4px 18px rgba(0,0,0,0.5)',
          }}
        >
          {handle}
        </span>
      </div>

      {/* Caption under the handle. */}
      <div
        style={{
          position: 'absolute',
          top: 720 * r.unit,
          left: 56 * r.unit,
          right: 56 * r.unit,
          textAlign: 'center',
          opacity: captionIn,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 30 * r.font,
          fontWeight: 600,
          color: '#cbd5f5',
          lineHeight: 1.25,
        }}
      >
        {caption}
      </div>

      {/* Category grid — 2 rows of 4 chips. */}
      <div
        style={{
          position: 'absolute',
          top: 880 * r.unit,
          left: 36 * r.unit,
          right: 36 * r.unit,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14 * r.unit,
        }}
      >
        {categories.map((cat, i) => {
          const t = chipIn(i)
          return (
            <div
              key={cat}
              style={{
                padding: `${14 * r.unit}px ${10 * r.unit}px`,
                background:
                  'linear-gradient(180deg, rgba(168,85,247,0.18) 0%, rgba(76,29,149,0.55) 100%)',
                border: '1px solid rgba(168,85,247,0.5)',
                borderRadius: 8,
                fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
                fontSize: 22 * r.font,
                fontWeight: 800,
                color: '#ede9fe',
                letterSpacing: 2,
                textAlign: 'center',
                textTransform: 'uppercase',
                opacity: t,
                transform: `translateY(${(1 - t) * 18}px)`,
                whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </div>
          )
        })}
      </div>

      {/* THEO DÕI NGAY red CTA — bottom, springs in + pulses. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 220 * r.unit,
          transform: `translateX(-50%) scale(${(0.7 + ctaIn * 0.3) * ctaPulse})`,
          opacity: ctaIn,
          padding: `${22 * r.unit}px ${52 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
          color: '#ffffff',
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 42 * r.font,
          fontWeight: 900,
          letterSpacing: 3,
          textTransform: 'uppercase',
          borderRadius: 14,
          boxShadow:
            '0 14px 36px rgba(239,68,68,0.6), 0 0 0 4px rgba(239,68,68,0.18)',
          whiteSpace: 'nowrap',
        }}
      >
        Theo dõi ngay
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
