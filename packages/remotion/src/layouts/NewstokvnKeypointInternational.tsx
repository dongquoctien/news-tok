import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointInternational — international-news thumbnail style.
 *
 * Inspired by the "INTERNATIONAL NEWS · Student Protest for Change"
 * thumbnail (red arched chip on top, B&W photo, timestamp, headline,
 * grey subtitle block). Brand-ported with the NEWSTOKVN purple plate
 * and yellow chip accents while keeping the red INTERNATIONAL chip
 * because that single signal is universal for "world news".
 *
 * Composition:
 *   - Red INTERNATIONAL NEWS arched chip pinned to the very top.
 *   - Photo full-bleed with a subtle desaturation (grayscale 0.25)
 *     so the headline reads as the "feature" element.
 *   - Bottom purple plate housing:
 *     - Yellow pill timestamp chip "DD MMM · HH:MM" (fileId).
 *     - Big bold white headline.
 *     - Body text in lighter weight (eyebrow used as subtitle).
 *     - "Đọc thêm" CTA.
 *
 * Slot mapping:
 *   - media (recommended) — full-bleed photo.
 *   - text (required) — bold white headline.
 *   - eyebrow (optional) — subtitle body 1-2 lines under the headline.
 *     Default fallback summary text.
 *   - fileId (optional) — yellow pill timestamp, default
 *     "10 AUG · 12:55 AM".
 *   - chips — not used.
 */
export function NewstokvnKeypointInternational({
  text,
  eyebrow,
  fileId,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const archIn = spring({ frame, fps, config: { damping: 13 } })
  const plateIn = interpolate(frame, [8, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const headlineIn = interpolate(frame, [16, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const subtitleIn = interpolate(frame, [28, 48], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const archLabel = 'INTERNATIONAL NEWS'
  const timestamp = (fileId || '10 AUG · 12:55 AM').toUpperCase()
  const subtitle =
    eyebrow ||
    'Cập nhật từ phóng viên thường trú. Theo dõi NEWSTOKVN để biết thêm chi tiết.'

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0314' }}>
      {/* Photo full-bleed, slight desaturate so brand chrome wins. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: 'grayscale(0.25) brightness(0.85)',
        }}
      >
        {media ? (
          <KenBurns
            src={media.path}
            from={1.04}
            to={1.10}
            panX={0}
            panY={0.01}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(135deg, #2e1065 0%, #1a0533 100%)',
            }}
          />
        )}
      </div>

      {/* Top arched red INTERNATIONAL NEWS chip — wide pill shape
          flush with the top edge. */}
      <div
        style={{
          position: 'absolute',
          top: '5.5%',
          left: '50%',
          transform: `translateX(-50%) scale(${0.7 + archIn * 0.3})`,
          opacity: archIn,
          padding: `${14 * r.unit}px ${44 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
          color: '#ffffff',
          borderRadius: 999,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: r.safeFont(28),
          fontWeight: 900,
          letterSpacing: 4,
          textTransform: 'uppercase',
          boxShadow: '0 12px 32px rgba(239,68,68,0.55)',
          whiteSpace: 'nowrap',
        }}
      >
        {archLabel}
      </div>

      {/* Bottom purple plate — housing timestamp, headline, subtitle. */}
      <div
        style={{
          position: 'absolute',
          left: '5%',
          right: '5%',
          bottom: '7%',
          // Tighter padding at square so the four stacked lines fit
          // without overflowing the plate.
          padding: r.square
            ? `${18 * r.unit}px ${20 * r.unit}px`
            : `${28 * r.unit}px ${24 * r.unit}px`,
          background:
            'linear-gradient(180deg, rgba(46,16,101,0.94) 0%, rgba(26,5,51,0.96) 100%)',
          borderRadius: 14,
          border: '1px solid rgba(168,85,247,0.4)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
          opacity: plateIn,
          transform: `translateY(${(1 - plateIn) * 24}px)`,
        }}
      >
        {/* Yellow pill timestamp. */}
        <div
          style={{
            display: 'inline-block',
            padding: `${6 * r.unit}px ${16 * r.unit}px`,
            background: 'linear-gradient(180deg, #facc15 0%, #ca8a04 100%)',
            color: '#1a0533',
            borderRadius: 999,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: r.safeFont(20),
            fontWeight: 800,
            letterSpacing: 2,
            marginBottom: 16 * r.unit,
          }}
        >
          {timestamp}
        </div>
        {/* Headline. */}
        <div
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: r.safeFont(60),
            fontWeight: 900,
            lineHeight: 1.1,
            color: '#ffffff',
            opacity: headlineIn,
            transform: `translateY(${(1 - headlineIn) * 12}px)`,
          }}
        >
          {text}
        </div>
        {/* Subtitle body — lighter weight, lavender. */}
        <div
          style={{
            marginTop: 18 * r.unit,
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: r.safeFont(26),
            fontWeight: 500,
            lineHeight: 1.35,
            color: '#cbd5f5',
            opacity: subtitleIn,
            transform: `translateY(${(1 - subtitleIn) * 10}px)`,
          }}
        >
          {subtitle}
        </div>
        {/* Read more line. */}
        <div
          style={{
            marginTop: 18 * r.unit,
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: r.safeFont(22),
            fontWeight: 800,
            letterSpacing: 2,
            color: '#facc15',
            opacity: subtitleIn,
          }}
        >
          ĐỌC THÊM →
        </div>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
