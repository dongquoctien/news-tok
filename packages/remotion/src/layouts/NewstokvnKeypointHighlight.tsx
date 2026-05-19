import {
  AbsoluteFill,
  Audio,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import { Leaf } from 'lucide-react'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointHighlight — magazine-style headline with yellow
 * highlight bar on the hook phrase.
 *
 * Inspired by the "rebuilding shattered LIVES AND COMMUNITIES AFTER
 * THE CONFLICT" thumbnail. Two design decisions ported into NEWSTOKVN
 * brand:
 *   1. The phrase wrapped in `**...**` gets a YELLOW highlight bar
 *      (vs purple plate in Flame) so this layout reads as more
 *      editorial / human-interest rather than urgent breaking news.
 *   2. The "Read more" CTA at the bottom feels like a magazine
 *      pullout — keeps the channel handle visible.
 *
 * Composition:
 *   - Full-bleed photo + heavy bottom + top darken.
 *   - Top-left: yellow "NEWS UPDATE" chip (eyebrow override).
 *   - Top-right: NEWSTOKVN handle in caps for brand recall.
 *   - Bottom: bold white headline (3-4 lines) with yellow highlight
 *     on accent phrases.
 *   - Bottom-most: leaf icon + "Read more" + handle right.
 *
 * Slot mapping:
 *   - media (recommended) — full-bleed photo.
 *   - eyebrow (optional) — top-left yellow chip text. Default
 *     "NEWS UPDATE".
 *   - text (required) — headline; `**phrase**` gets a yellow
 *     highlight bar painted behind it.
 *   - fileId (optional) — bottom-right handle, default
 *     "@newstokvn".
 *   - chips — not used.
 */
export function NewstokvnKeypointHighlight({
  text,
  eyebrow,
  fileId,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const tagIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const headlineIn = interpolate(frame, [10, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const ctaIn = interpolate(frame, [24, 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const chipLabel = (eyebrow || 'NEWS UPDATE').toUpperCase()
  const handle = (fileId || '@newstokvn').toLowerCase()
  const parts = splitAccent(text.toUpperCase())

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0314' }}>
      {media ? (
        <KenBurns
          src={media.path}
          from={1.06}
          to={1.14}
          panX={0}
          panY={-0.02}
          edits={segment.backgroundEdits}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(135deg, #4c1d95 0%, #1a0533 100%)',
          }}
        />
      )}
      {/* Top + bottom darken — chips and headline both need plates. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,3,20,0.55) 0%, rgba(11,3,20,0.0) 25%, rgba(11,3,20,0.0) 45%, rgba(11,3,20,0.75) 72%, rgba(11,3,20,0.97) 100%)',
        }}
      />

      {/* Top-left yellow NEWS UPDATE chip. */}
      <div
        style={{
          position: 'absolute',
          top: 56 * r.unit,
          left: 56 * r.unit,
          padding: `${10 * r.unit}px ${18 * r.unit}px`,
          background: 'linear-gradient(180deg, #facc15 0%, #ca8a04 100%)',
          color: '#1a0533',
          borderRadius: 4,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 24 * r.font,
          fontWeight: 900,
          letterSpacing: 3,
          textTransform: 'uppercase',
          opacity: tagIn,
          transform: `translateY(${(1 - tagIn) * -16}px)`,
          boxShadow: '0 8px 22px rgba(250,204,21,0.5)',
        }}
      >
        {chipLabel}
      </div>

      {/* Top-right brand handle for brand recall. */}
      <div
        style={{
          position: 'absolute',
          top: 56 * r.unit,
          right: 56 * r.unit,
          textAlign: 'right',
          opacity: tagIn,
          transform: `translateY(${(1 - tagIn) * -16}px)`,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 22 * r.font,
          fontWeight: 900,
          color: '#ffffff',
          letterSpacing: 3,
          textTransform: 'uppercase',
          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        NEWSTOKVN.
      </div>

      {/* Headline — bold caps, yellow highlight on accent phrases. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 220 * r.unit,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 74 * r.font,
          fontWeight: 900,
          lineHeight: 1.05,
          letterSpacing: 0.5,
          color: '#ffffff',
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 24}px)`,
          textShadow: '0 4px 22px rgba(0,0,0,0.85)',
          wordBreak: 'break-word',
        }}
      >
        {parts.map((p, i) =>
          p.kind === 'accent' ? (
            <span
              key={i}
              style={{
                background: 'linear-gradient(180deg, #facc15 0%, #ca8a04 100%)',
                color: '#1a0533',
                padding: `${2 * r.unit}px ${12 * r.unit}px`,
                marginRight: 6 * r.unit,
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
                boxShadow: '0 6px 18px rgba(250,204,21,0.55)',
              }}
            >
              {p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </div>

      {/* Bottom CTA row — leaf icon + "Read more" left, handle right. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 90 * r.unit,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: ctaIn,
          transform: `translateY(${(1 - ctaIn) * 12}px)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 * r.unit }}>
          <Leaf size={28 * r.unit} strokeWidth={2.4} color="#facc15" fill="#facc15" />
          <span
            style={{
              fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
              fontSize: 26 * r.font,
              fontWeight: 800,
              color: '#facc15',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Đọc thêm
          </span>
        </div>
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 24 * r.font,
            fontWeight: 700,
            color: '#ede9fe',
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

/** Shared `**phrase**` accent splitter — kept inline per layout file
 *  so tweaking one layout's accent rule can't break another. */
function splitAccent(input: string): Array<{ kind: 'plain' | 'accent'; text: string }> {
  if (!input.includes('**')) return [{ kind: 'plain', text: input }]
  const out: Array<{ kind: 'plain' | 'accent'; text: string }> = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) out.push({ kind: 'plain', text: input.slice(last, m.index) })
    out.push({ kind: 'accent', text: m[1]! })
    last = m.index + m[0].length
  }
  if (last < input.length) out.push({ kind: 'plain', text: input.slice(last) })
  return out
}
