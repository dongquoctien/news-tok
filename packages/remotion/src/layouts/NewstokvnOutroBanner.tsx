import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Flame, Zap } from 'lucide-react'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnOutroBanner — "channel banner" recap outro.
 *
 * The mirror of NewstokvnIntroCover at the END of the video. After
 * the body of the video has played out the channel signature, this
 * closes back on the same visual identity so a new viewer sees the
 * brand twice (intro + outro) — established repeat-recognition
 * heuristic for short-form video channels.
 *
 * Composition:
 *   - Deep purple gradient bg, speed-streak overlay (matches IntroCover).
 *   - Top-left: small flame badge "TIN NÓNG".
 *   - Top-right: red "BREAKING 24/7" badge.
 *   - Middle: NEWSTOKVN logo + handle.
 *   - Bottom: big bold caps gradient headline + tagline. Lightning
 *     bolts flank the headline.
 *
 * Slot mapping mirrors IntroCover so a project can copy/paste the
 * style cluster between intro and outro segments and only differ in
 * the layoutId.
 *
 * Slot mapping:
 *   - text (required) — headline; defaults to the channel mark
 *     "TIN NHANH · PHÁP LUẬT · KHOA HỌC".
 *   - eyebrow (optional) — tagline; default same as IntroCover.
 *   - fileId (optional) — handle override, default "@newstokvn".
 *   - media — ignored.
 */
export function NewstokvnOutroBanner({
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

  // Cascade: badges → logo → headline → bolts → tagline.
  const badgesIn = spring({ frame, fps, config: { damping: 13 } })
  const logoIn = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 14 },
  })
  const headlineIn = spring({
    frame: Math.max(0, frame - 22),
    fps,
    config: { damping: 14 },
  })
  const boltLeftIn = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: { damping: 11 },
  })
  const boltRightIn = spring({
    frame: Math.max(0, frame - 34),
    fps,
    config: { damping: 11 },
  })
  const taglineIn = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const handle = (fileId || '@newstokvn').toLowerCase()
  const tagline =
    eyebrow || 'TIN NÓNG HỔI · CẬP NHẬT LIÊN TỤC · ĐÚNG NHANH ĐÁNG TIN CẬY'

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 50% 50%, #4c1d95 0%, #2e1065 55%, #0b0314 100%)',
      }}
    >
      {/* Speed streaks — matches IntroCover. */}
      <AbsoluteFill
        style={{
          opacity: 0.08,
          background:
            'repeating-linear-gradient(105deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 80px)',
        }}
      />

      {/* Top-left flame badge. */}
      <div
        style={{
          position: 'absolute',
          top: 80 * r.unit,
          left: 56 * r.unit,
          display: 'flex',
          alignItems: 'center',
          gap: 10 * r.unit,
          padding: `${10 * r.unit}px ${18 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)',
          color: '#ffffff',
          borderRadius: 6,
          boxShadow: '0 8px 22px rgba(239,68,68,0.55)',
          opacity: badgesIn,
          transform: `translateY(${(1 - badgesIn) * -20}px)`,
        }}
      >
        <Flame size={28 * r.unit} strokeWidth={2.6} color="#facc15" fill="#facc15" />
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 22 * r.font,
            fontWeight: 900,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          Tin nóng
        </span>
      </div>

      {/* Top-right BREAKING 24/7 chip. */}
      <div
        style={{
          position: 'absolute',
          top: 80 * r.unit,
          right: 56 * r.unit,
          padding: `${10 * r.unit}px ${18 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)',
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 22 * r.font,
          fontWeight: 900,
          letterSpacing: 2,
          textTransform: 'uppercase',
          borderRadius: 6,
          boxShadow: '0 8px 22px rgba(239,68,68,0.55)',
          opacity: badgesIn,
          transform: `translateY(${(1 - badgesIn) * -20}px)`,
        }}
      >
        Breaking 24/7
      </div>

      {/* Logo + handle stack in upper-middle. */}
      <div
        style={{
          position: 'absolute',
          top: 320 * r.unit,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14 * r.unit,
          opacity: logoIn,
          transform: `translateY(${(1 - logoIn) * 30}px) scale(${0.85 + logoIn * 0.15})`,
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
              '0 0 60px rgba(168,85,247,0.55), 0 16px 40px rgba(0,0,0,0.55)',
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
            fontSize: 34 * r.font,
            fontWeight: 800,
            color: '#ede9fe',
            letterSpacing: 1,
            textShadow: '0 4px 14px rgba(0,0,0,0.45)',
          }}
        >
          {handle}
        </span>
      </div>

      {/* Lightning bolts at the headline corners. */}
      <div
        style={{
          position: 'absolute',
          top: 1100 * r.unit,
          left: 36 * r.unit,
          transform: `translateY(${(1 - boltLeftIn) * 24}px) rotate(${-12 - (1 - boltLeftIn) * 20}deg)`,
          opacity: boltLeftIn,
        }}
      >
        <Zap
          size={72 * r.unit}
          strokeWidth={2.5}
          color="#facc15"
          fill="#facc15"
          style={{ filter: 'drop-shadow(0 6px 18px rgba(250,204,21,0.55))' }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1100 * r.unit,
          right: 36 * r.unit,
          transform: `translateY(${(1 - boltRightIn) * 24}px) rotate(${12 + (1 - boltRightIn) * 20}deg)`,
          opacity: boltRightIn,
        }}
      >
        <Zap
          size={72 * r.unit}
          strokeWidth={2.5}
          color="#facc15"
          fill="#facc15"
          style={{ filter: 'drop-shadow(0 6px 18px rgba(250,204,21,0.55))' }}
        />
      </div>

      {/* Big gradient headline. */}
      <div
        style={{
          position: 'absolute',
          top: 1100 * r.unit,
          left: 140 * r.unit,
          right: 140 * r.unit,
          textAlign: 'center',
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 30}px)`,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 60 * r.font,
          fontWeight: 900,
          lineHeight: 1.04,
          letterSpacing: 1,
          textTransform: 'uppercase',
          background:
            'linear-gradient(180deg, #ffffff 0%, #ede9fe 60%, #c4b5fd 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: '0 4px 24px rgba(168,85,247,0.4)',
        }}
      >
        {text || 'TIN NHANH · PHÁP LUẬT · KHOA HỌC'}
      </div>

      {/* Bottom tagline. */}
      <div
        style={{
          position: 'absolute',
          bottom: 200 * r.unit,
          left: 56 * r.unit,
          right: 56 * r.unit,
          textAlign: 'center',
          opacity: taglineIn,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 26 * r.font,
          fontWeight: 600,
          color: '#c4b5fd',
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}
      >
        {tagline}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
