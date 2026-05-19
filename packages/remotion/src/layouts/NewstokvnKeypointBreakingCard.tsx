import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Globe } from 'lucide-react'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointBreakingCard — "newspaper card on red" look.
 *
 * Inspired by the BREAKING NEWS thumbnail design (white photo card
 * floating on a bold colour bg, with an arched chip banner sitting
 * over the top edge of the card). Brand-port: red bg → NEWSTOKVN
 * purple, while keeping the red BREAKING / LIVE accents.
 *
 * Composition:
 *   - Brand-purple full-bleed background with subtle pattern.
 *   - Centered WHITE card (rounded, drop-shadow) containing the
 *     photo upper-half + headline text-block lower-half.
 *   - Red "BREAKING NEWS" arched chip sits ON the top edge of the
 *     card, half above / half on it — the visual anchor.
 *   - Rotating "LIVE" badge top-left of the photo with a Globe
 *     icon (spins slowly).
 *   - Lower purple plate beneath the card: "HOT NEWS THIS
 *     MORNING" lower-third + tagline.
 *   - Footer line: "Follow us on:" + @handle.
 *
 * Slot mapping:
 *   - media (recommended) — photo inside the card.
 *   - text (required) — red headline inside the card.
 *   - eyebrow (optional) — override BREAKING NEWS chip, default
 *     "BREAKING NEWS".
 *   - fileId (optional) — override "HOT NEWS THIS MORNING"
 *     lower-third label.
 *   - chips — not used.
 */
export function NewstokvnKeypointBreakingCard({
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

  // Card drops in with a spring + the chip arches in on top.
  const cardIn = spring({ frame, fps, config: { damping: 14 } })
  const chipIn = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 11 },
  })
  // LIVE globe rotates continuously (slow — full revolution per ~2s).
  const liveSpin = (frame / 60) * 360
  // Lower-third slides up later.
  const lowerThirdIn = interpolate(frame, [22, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const chipLabel = (eyebrow || 'BREAKING NEWS').toUpperCase()
  const lowerThirdLabel = (fileId || 'HOT NEWS THIS MORNING').toUpperCase()

  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(160deg, #4c1d95 0%, #2e1065 55%, #1a0533 100%)',
      }}
    >
      {/* Diagonal speed-streak overlay matches the brand cover. */}
      <AbsoluteFill
        style={{
          opacity: 0.07,
          background:
            'repeating-linear-gradient(105deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 80px)',
        }}
      />

      {/* White card — photo top, headline plate bottom. */}
      <div
        style={{
          position: 'absolute',
          top: 220 * r.unit,
          left: 80 * r.unit,
          right: 80 * r.unit,
          height: 1180 * r.unit,
          background: '#ffffff',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 28px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.08)',
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 30}px)`,
        }}
      >
        {/* Photo zone — upper portion of card. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '60%',
            overflow: 'hidden',
            backgroundColor: '#0b0314',
          }}
        >
          {media ? (
            <KenBurns
              src={media.path}
              from={1.05}
              to={1.12}
              panX={0}
              panY={0}
              edits={segment.backgroundEdits}
            />
          ) : (
            <AbsoluteFill
              style={{
                background: 'linear-gradient(135deg, #4c1d95 0%, #1a0533 100%)',
              }}
            />
          )}
        </div>

        {/* Headline plate — red text on white. */}
        <div
          style={{
            position: 'absolute',
            left: 32 * r.unit,
            right: 32 * r.unit,
            top: '64%',
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 56 * r.font,
            fontWeight: 900,
            lineHeight: 1.1,
            color: '#dc2626',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {text}
        </div>
      </div>

      {/* BREAKING NEWS arched chip — sits ON the top edge of the card. */}
      <div
        style={{
          position: 'absolute',
          top: 170 * r.unit,
          left: '50%',
          transform: `translateX(-50%) scale(${0.7 + chipIn * 0.3})`,
          opacity: chipIn,
        }}
      >
        <div
          style={{
            background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
            color: '#ffffff',
            padding: `${18 * r.unit}px ${50 * r.unit}px`,
            borderRadius: 999,
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 36 * r.font,
            fontWeight: 900,
            letterSpacing: 4,
            textTransform: 'uppercase',
            boxShadow: '0 14px 32px rgba(239,68,68,0.55)',
            whiteSpace: 'nowrap',
          }}
        >
          {chipLabel}
        </div>
      </div>

      {/* LIVE rotating badge — top-left of the photo inside card. */}
      <div
        style={{
          position: 'absolute',
          top: 280 * r.unit,
          left: 112 * r.unit,
          display: 'flex',
          alignItems: 'center',
          gap: 8 * r.unit,
          padding: `${8 * r.unit}px ${14 * r.unit}px`,
          background: 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)',
          color: '#ffffff',
          borderRadius: 6,
          boxShadow: '0 6px 16px rgba(239,68,68,0.5)',
          opacity: cardIn,
        }}
      >
        <Globe
          size={22 * r.unit}
          strokeWidth={2.4}
          color="#ffffff"
          style={{ transform: `rotate(${liveSpin}deg)` }}
        />
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 18 * r.font,
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Live news
        </span>
      </div>

      {/* Lower-third — purple plate UNDER the card. */}
      <div
        style={{
          position: 'absolute',
          left: 80 * r.unit,
          right: 80 * r.unit,
          bottom: 220 * r.unit,
          background:
            'linear-gradient(180deg, rgba(76,29,149,0.95) 0%, rgba(46,16,101,0.98) 100%)',
          padding: `${14 * r.unit}px ${22 * r.unit}px`,
          borderRadius: 8,
          opacity: lowerThirdIn,
          transform: `translateY(${(1 - lowerThirdIn) * 18}px)`,
        }}
      >
        <div
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 24 * r.font,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: 3,
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          {lowerThirdLabel}
        </div>
      </div>

      {/* Footer follow line. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 100 * r.unit,
          textAlign: 'center',
          opacity: lowerThirdIn,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 22 * r.font,
          fontWeight: 700,
          color: '#ede9fe',
          letterSpacing: 1,
        }}
      >
        Follow us on: <span style={{ color: '#facc15' }}>@newstokvn</span>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
