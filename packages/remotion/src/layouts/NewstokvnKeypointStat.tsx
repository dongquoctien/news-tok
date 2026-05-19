import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Flame } from 'lucide-react'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointStat — single-number hero keypoint.
 *
 * Use when the segment's story is "one big number" — a sum
 * (45 tỷ đồng), a count (1.600 tấn), a percent (47%), a year
 * (2026). Stat reads in the first 1.5s; headline reads after.
 *
 * Composition:
 *   - Photo full-bleed top half with KenBurns push.
 *   - Bottom half: deep purple plate with HUGE stat number (top),
 *     small uppercase label (mid), headline body (bottom).
 *   - Top-left: small flame chip + eyebrow (defaults "TIN NÓNG").
 *   - Counter springs in, label fades, headline cascades.
 *
 * Slot mapping:
 *   - media (recommended) — photo upper half.
 *   - text (required) — headline body underneath the stat.
 *   - eyebrow (optional) — top-left flame chip text, default
 *     "TIN NÓNG".
 *   - fileId (REQUIRED for this layout) — the big number itself,
 *     e.g. "45 TỶ ĐỒNG", "1.600 TẤN", "47%". Falls back to "—"
 *     and a hint if missing so the layout still renders rather
 *     than throws.
 *   - chips (optional, max 1) — small caption ABOVE the number
 *     (e.g. "TỔNG THIỆT HẠI"). Defaults to the eyebrow.
 */
export function NewstokvnKeypointStat({
  text,
  eyebrow,
  chips,
  fileId,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  // Stat spring with a slight 0.3s delay so the photo lands first.
  const statIn = spring({
    frame: Math.max(0, frame - 9),
    fps,
    config: { damping: 12, mass: 0.8 },
  })
  // Label + headline cascade after the stat.
  const labelIn = interpolate(frame, [18, 32], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const headlineIn = interpolate(frame, [28, 46], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  // Flame chip pulse — same idiom as KeypointFlame so the brand
  // family feels cohesive.
  const pulse = interpolate(
    Math.sin((frame / 36) * Math.PI * 2),
    [-1, 1],
    [0.88, 1]
  )

  const flameLabel = (eyebrow || 'TIN NÓNG').toUpperCase()
  const statValue = (fileId || '—').toUpperCase()
  const statLabel = (chips && chips[0] ? chips[0] : eyebrow || 'CON SỐ NỔI BẬT').toUpperCase()

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0314' }}>
      {/* Photo top half — KenBurns. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50%',
          overflow: 'hidden',
          backgroundColor: '#1a0533',
        }}
      >
        {media ? (
          <KenBurns
            src={media.path}
            from={1.06}
            to={1.16}
            panX={0}
            panY={-0.02}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(135deg, #4c1d95 0%, #1a0533 100%)',
            }}
          />
        )}
        {/* Soft bottom darken so the seam to the purple plate is
            invisible — readers shouldn't see a hard edge. */}
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.0) 60%, rgba(11,3,20,0.95) 100%)',
          }}
        />
      </div>

      {/* Bottom half — deep purple plate. */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'linear-gradient(180deg, #2e1065 0%, #1a0533 60%, #0b0314 100%)',
        }}
      />

      {/* Flame chip top-left. */}
      <div
        style={{
          position: 'absolute',
          top: 56 * r.unit,
          left: 56 * r.unit,
          display: 'flex',
          alignItems: 'center',
          gap: 10 * r.unit,
          padding: `${10 * r.unit}px ${18 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)',
          color: '#ffffff',
          borderRadius: 6,
          boxShadow: '0 8px 22px rgba(239,68,68,0.55)',
          opacity: pulse,
        }}
      >
        <Flame size={28 * r.unit} strokeWidth={2.6} color="#facc15" fill="#facc15" />
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 24 * r.font,
            fontWeight: 900,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {flameLabel}
        </span>
      </div>

      {/* Stat label (above the number). */}
      <div
        style={{
          position: 'absolute',
          top: '54%',
          left: 56 * r.unit,
          right: 56 * r.unit,
          textAlign: 'center',
          opacity: labelIn,
          transform: `translateY(${(1 - labelIn) * 12}px)`,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 26 * r.font,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: '#facc15',
        }}
      >
        {statLabel}
      </div>

      {/* THE NUMBER — hero of the layout. Spring scale + fade.
          Gradient text + drop shadow for impact. */}
      <div
        style={{
          position: 'absolute',
          top: '58%',
          left: 56 * r.unit,
          right: 56 * r.unit,
          textAlign: 'center',
          opacity: statIn,
          transform: `scale(${0.6 + statIn * 0.4})`,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 130 * r.font,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: -1,
          background:
            'linear-gradient(180deg, #ffffff 0%, #ede9fe 55%, #c4b5fd 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: '0 8px 28px rgba(168,85,247,0.55)',
        }}
      >
        {statValue}
      </div>

      {/* Headline body — sits BELOW the number, ~18% of canvas
          height down from there. Cascades in last. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 160 * r.unit,
          textAlign: 'center',
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 16}px)`,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 42 * r.font,
          fontWeight: 700,
          lineHeight: 1.18,
          color: '#ede9fe',
          textShadow: '0 4px 18px rgba(0,0,0,0.55)',
        }}
      >
        {text}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
