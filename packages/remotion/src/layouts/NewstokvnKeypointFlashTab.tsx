import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointFlashTab — editorial flash-news layout.
 *
 * Inspired by the "Studio Showe · Flash News" airport-photo
 * thumbnail. Combines a clean top brand bar with a vertical red
 * FLASH NEWS tab sticker on the photo edge, then a deep purple
 * lower-third that holds the body caption.
 *
 * Composition:
 *   - Top brand bar: small logo + NEWSTOKVN handle right-aligned,
 *     thin purple separator under it.
 *   - Photo zone: upper 55% with KenBurns push.
 *   - Vertical red FLASH NEWS tab sticking out on the left edge of
 *     the photo — sits half on, half off so it reads as a sticker.
 *   - Lower-third purple plate housing the body caption (text).
 *   - Bottom-left: "More Details →" link with handle right.
 *
 * Slot mapping:
 *   - media (recommended) — photo upper half.
 *   - text (required) — body caption inside the purple plate.
 *   - eyebrow (optional) — vertical tab label, default "FLASH NEWS".
 *   - fileId (optional) — handle override, default "newstokvn.com".
 *   - chips — not used.
 */
export function NewstokvnKeypointFlashTab({
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

  const brandIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const tabIn = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 12 },
  })
  const captionIn = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const linkIn = interpolate(frame, [36, 54], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const tabLabel = (eyebrow || 'FLASH NEWS').toUpperCase()
  const handle = fileId || 'newstokvn.com'

  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(180deg, #2e1065 0%, #1a0533 60%, #0b0314 100%)',
      }}
    >
      {/* Top brand bar — fixed height, dark plate with logo + handle. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 130 * r.unit,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${40 * r.unit}px`,
          opacity: brandIn,
          transform: `translateY(${(1 - brandIn) * -12}px)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 * r.unit }}>
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
              boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
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
              fontSize: 22 * r.font,
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            NEWSTOKVN
          </span>
        </div>
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 20 * r.font,
            fontWeight: 700,
            color: '#cbd5f5',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          {handle}
        </span>
      </div>

      {/* Photo zone — upper 55% under the top bar. */}
      <div
        style={{
          position: 'absolute',
          top: 130 * r.unit,
          left: 0,
          right: 0,
          height: '55%',
          overflow: 'hidden',
          backgroundColor: '#1a0533',
        }}
      >
        {media ? (
          <KenBurns
            src={media.path}
            from={1.04}
            to={1.10}
            panX={0}
            panY={0.02}
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

      {/* Vertical FLASH NEWS red tab — sticks out from the left edge of
          the photo, half on, half off. Rotated -90deg so the text
          reads bottom-to-top. */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(38%)',
          left: 0,
          transform: `translateX(${tabIn * 0 + (1 - tabIn) * -120}px)`,
          opacity: tabIn,
          padding: `${10 * r.unit}px ${20 * r.unit}px`,
          background: 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)',
          color: '#ffffff',
          borderTopRightRadius: 6,
          borderBottomRightRadius: 6,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 22 * r.font,
          fontWeight: 900,
          letterSpacing: 3,
          textTransform: 'uppercase',
          boxShadow: '0 10px 24px rgba(239,68,68,0.55)',
        }}
      >
        {tabLabel}
      </div>

      {/* Lower-third caption plate. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 220 * r.unit,
          padding: `${24 * r.unit}px ${28 * r.unit}px`,
          background:
            'linear-gradient(180deg, rgba(46,16,101,0.96) 0%, rgba(26,5,51,0.98) 100%)',
          borderRadius: 12,
          border: '1px solid rgba(168,85,247,0.4)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
          opacity: captionIn,
          transform: `translateY(${(1 - captionIn) * 18}px)`,
        }}
      >
        <div
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 34 * r.font,
            fontWeight: 700,
            lineHeight: 1.25,
            color: '#ffffff',
            textShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          {text}
        </div>
      </div>

      {/* Bottom row — "More Details →" + handle. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 110 * r.unit,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: linkIn,
        }}
      >
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 24 * r.font,
            fontWeight: 800,
            color: '#facc15',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          More details →
        </span>
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 22 * r.font,
            fontWeight: 700,
            color: '#cbd5f5',
            letterSpacing: 1,
          }}
        >
          {handle}
        </span>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
