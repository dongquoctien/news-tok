import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * StoryChip — sports / showbiz "thumbnail" look (U17 VN style).
 *
 * Full-bleed photo, big bold uppercase headline at the bottom in
 * white, with any phrase wrapped in `**...**` painted bright yellow
 * for the quoted accent (e.g. "QUẨY XẾ" HÒA MŨ). A small yellow
 * chip pill sits BELOW the headline (e.g. "BÓNG ĐÁ") sourced from
 * `eyebrow` — falls back to "TIN MỚI" when absent.
 *
 * Slot mapping:
 *   - media (required) — full-bleed background; KenBurns push-in.
 *   - eyebrow (optional) — bottom yellow chip text. Defaults "TIN MỚI".
 *   - text (required) — headline; wrap accent in **...**.
 *   - chips / fileId — not used.
 */
export function StoryChip({
  text,
  eyebrow,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const chipLabel = (eyebrow || 'TIN MỚI').toUpperCase()
  const parts = splitAccent(text.toUpperCase())

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {media ? (
        <KenBurns
          src={media.path}
          from={1.08}
          to={1.16}
          panX={0.02}
          panY={0.02}
          edits={segment.backgroundEdits}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #0b0b0f 100%)',
          }}
        />
      )}

      {/* Heavier bottom gradient — headline + chip need to win
          against busy sports / crowd backgrounds. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 30%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.95) 100%)',
        }}
      />

      {/* Headline — bottom-anchored. Uppercase, very heavy weight,
          tight leading. Accent phrase from **...** turns yellow. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 180 * r.unit,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 84 * r.font,
          fontWeight: 900,
          lineHeight: 1.04,
          letterSpacing: 0.5,
          color: '#ffffff',
          textAlign: 'left',
          textTransform: 'uppercase',
          textShadow: '0 4px 18px rgba(0,0,0,0.8)',
          wordBreak: 'break-word',
        }}
      >
        {parts.map((p, i) =>
          p.kind === 'accent' ? (
            <span key={i} style={{ color: '#facc15' }}>
              {p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </div>

      {/* Bottom yellow chip — sits below the headline like a topic tag. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          bottom: 96 * r.unit,
          background: '#facc15',
          color: '#0b0b0f',
          padding: `${10 * r.unit}px ${22 * r.unit}px`,
          borderRadius: 6,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 28 * r.font,
          fontWeight: 900,
          letterSpacing: 3,
          textTransform: 'uppercase',
          boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
        }}
      >
        {chipLabel}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}

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
