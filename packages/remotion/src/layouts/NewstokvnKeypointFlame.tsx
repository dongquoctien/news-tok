import {
  AbsoluteFill,
  Audio,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import { Flame } from 'lucide-react'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointFlame — punchy "single body beat" keypoint.
 *
 * Composition:
 *   - Full-bleed photo + heavy bottom darken.
 *   - Top-left flame icon + "TIN NÓNG" chip (eyebrow override
 *     supported) that pulses subtly so the eye lands top-left first.
 *   - White headline at the bottom, big bold. Phrases wrapped in
 *     `**...**` get a purple plate accent for the hook word, matching
 *     the StoryPill / StoryChip convention used elsewhere.
 *
 * Slot mapping:
 *   - media (required) — full-bleed background.
 *   - eyebrow (optional) — override "TIN NÓNG".
 *   - text (required) — headline; **phrase** marks accent.
 *   - chips / fileId — not used.
 *
 * No TextBlock here because the **accent** painting is per-phrase
 * styling the renderer's TextBlock primitive doesn't expose.
 */
export function NewstokvnKeypointFlame({
  text,
  eyebrow,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  // Subtle pulse on the flame chip — 1.2s cycle so it reads as
  // "still live" rather than seizure-inducing.
  const pulse = interpolate(
    Math.sin((frame / 36) * Math.PI * 2),
    [-1, 1],
    [0.86, 1]
  )

  const chipLabel = (eyebrow || 'TIN NÓNG').toUpperCase()
  const parts = splitAccent(text)

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
      {/* Bottom darken so white headline reads on busy photos. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,3,20,0.0) 0%, rgba(11,3,20,0.0) 35%, rgba(11,3,20,0.75) 72%, rgba(11,3,20,0.96) 100%)',
        }}
      />

      {/* Flame chip — top-left. Pulses. */}
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
          {chipLabel}
        </span>
      </div>

      {/* Bottom headline — accents repainted on a purple plate. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 140 * r.unit,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 76 * r.font,
          fontWeight: 900,
          lineHeight: 1.08,
          color: '#ffffff',
          textAlign: 'left',
          textShadow: '0 4px 22px rgba(0,0,0,0.85)',
          wordBreak: 'break-word',
        }}
      >
        {parts.map((p, i) =>
          p.kind === 'accent' ? (
            <span
              key={i}
              style={{
                background: 'linear-gradient(180deg, #a855f7 0%, #7c3aed 100%)',
                color: '#ffffff',
                padding: `${4 * r.unit}px ${14 * r.unit}px`,
                borderRadius: 6,
                marginRight: 6 * r.unit,
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
                boxShadow: '0 6px 18px rgba(124,58,237,0.55)',
              }}
            >
              {p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}

/**
 * Split a string on **accent** markers, keeping the surrounding text
 * intact. Same helper that StoryPill / StoryChip use — kept inline
 * per file so editing one layout's accent rule doesn't accidentally
 * change another's behaviour.
 */
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
