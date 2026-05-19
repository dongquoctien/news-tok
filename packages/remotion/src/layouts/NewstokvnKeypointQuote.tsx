import {
  AbsoluteFill,
  Audio,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import { Quote } from 'lucide-react'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointQuote — pull-quote keypoint.
 *
 * Use when the segment carries a direct quote: an official statement,
 * a witness's words, a press release line. The big purple quote
 * glyph anchors the eye and signals "this is a quote, not the
 * reporter's voice".
 *
 * Composition:
 *   - Full-bleed photo (typically a portrait or scene from the event)
 *     with heavy bottom darken so the quote reads.
 *   - Top-left: small purple Quote icon for the brand "speech mark".
 *   - Center-bottom: the quote text in italic serif-ish bold, with
 *     opening/closing curly quotes baked into the string render.
 *   - Below the quote: attribution line (fileId), small caps with
 *     a leading em-dash, e.g. "— Theo VTV24" or "— Đại diện Bộ Y tế".
 *
 * Slot mapping:
 *   - media (recommended) — portrait of the speaker / event scene.
 *   - text (required) — the quote body; will be wrapped in “…”.
 *   - eyebrow (optional) — small caps tag above the quote, default
 *     "PHÁT NGÔN".
 *   - fileId (optional) — attribution; will be prefixed with "— ".
 *     Defaults to "@newstokvn".
 *   - chips — not used.
 */
export function NewstokvnKeypointQuote({
  text,
  eyebrow,
  fileId,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  // Quote rises in from below + fades.
  const quoteIn = interpolate(frame, [6, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  // Attribution after the quote settles.
  const attributionIn = interpolate(frame, [26, 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  // Top tag with a tiny stagger.
  const tagIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const tagLabel = (eyebrow || 'PHÁT NGÔN').toUpperCase()
  const attribution = fileId || '@newstokvn'

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0314' }}>
      {media ? (
        <KenBurns
          src={media.path}
          from={1.04}
          to={1.10}
          panX={-0.02}
          panY={0.01}
          edits={segment.backgroundEdits}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(135deg, #4c1d95 0%, #1a0533 100%)',
          }}
        />
      )}
      {/* Deep bottom darken — quotes need a calm canvas. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,3,20,0.20) 0%, rgba(11,3,20,0.20) 32%, rgba(11,3,20,0.78) 60%, rgba(11,3,20,0.98) 100%)',
        }}
      />

      {/* Top-left small tag chip "PHÁT NGÔN". */}
      <div
        style={{
          position: 'absolute',
          top: 56 * r.unit,
          left: 56 * r.unit,
          display: 'flex',
          alignItems: 'center',
          gap: 10 * r.unit,
          padding: `${8 * r.unit}px ${16 * r.unit}px`,
          background:
            'linear-gradient(180deg, rgba(168,85,247,0.95) 0%, rgba(124,58,237,0.95) 100%)',
          color: '#ffffff',
          borderRadius: 4,
          opacity: tagIn,
          transform: `translateY(${(1 - tagIn) * -10}px)`,
          boxShadow: '0 6px 18px rgba(124,58,237,0.5)',
        }}
      >
        <Quote size={24 * r.unit} strokeWidth={2.5} color="#ffffff" />
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 22 * r.font,
            fontWeight: 900,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {tagLabel}
        </span>
      </div>

      {/* Big purple opening quote glyph — sits behind the text as
          decoration. Position above the quote text. */}
      <div
        style={{
          position: 'absolute',
          left: 40 * r.unit,
          bottom: 600 * r.unit,
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 280 * r.font,
          fontWeight: 900,
          lineHeight: 1,
          color: '#a855f7',
          opacity: 0.85 * quoteIn,
          textShadow: '0 8px 32px rgba(168,85,247,0.55)',
          pointerEvents: 'none',
        }}
      >
        “
      </div>

      {/* Quote text — center-bottom, italic serif. The string is
          wrapped in curly quotes so even when the user types a
          plain headline it reads as a quote. */}
      <div
        style={{
          position: 'absolute',
          left: 64 * r.unit,
          right: 64 * r.unit,
          bottom: 220 * r.unit,
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 58 * r.font,
          fontWeight: 700,
          fontStyle: 'italic',
          lineHeight: 1.2,
          color: '#ffffff',
          textAlign: 'center',
          opacity: quoteIn,
          transform: `translateY(${(1 - quoteIn) * 20}px)`,
          textShadow: '0 4px 22px rgba(0,0,0,0.7)',
        }}
      >
        “{text}”
      </div>

      {/* Attribution line — small, em-dash prefix, lavender. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 130 * r.unit,
          textAlign: 'center',
          opacity: attributionIn,
          transform: `translateY(${(1 - attributionIn) * 12}px)`,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 28 * r.font,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: '#c4b5fd',
        }}
      >
        — {attribution}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
