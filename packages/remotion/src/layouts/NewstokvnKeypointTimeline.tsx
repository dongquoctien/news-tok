import {
  AbsoluteFill,
  Audio,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import { Clock } from 'lucide-react'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointTimeline — chronology keypoint.
 *
 * Use when the segment is "what happened, in order" — incident
 * recaps, election-day moves, a war day's events, a court hearing's
 * beats. Three rows max so the eye doesn't drown.
 *
 * Composition:
 *   - Top 38%: photo with KenBurns + soft bottom darken.
 *   - "DIỄN BIẾN" tag chip top-left over the media.
 *   - Bottom 62%: dotted vertical timeline with up to 3 timestamped
 *     events. Each row = filled purple dot + connecting line +
 *     bold timestamp + short description.
 *   - Headline sits BELOW the timeline as the bottom-most line.
 *
 * Chip parsing convention: each chip is split on the first "·" or
 * "—" or " - " into (timestamp, description). Falls back to
 * (chip-text, "") when no separator is present.
 *
 * Slot mapping:
 *   - media (recommended) — context photo top.
 *   - eyebrow (optional) — tag chip text, default "DIỄN BIẾN".
 *   - chips (REQUIRED, 1-3 entries) — each entry is
 *     "HH:MM · description" or "HH:MM — description". Fallback
 *     content rendered if missing so the layout doesn't break.
 *   - text (required) — headline at the bottom summarising the day.
 *   - fileId — not used.
 */
export function NewstokvnKeypointTimeline({
  text,
  eyebrow,
  chips,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const tagLabel = (eyebrow || 'DIỄN BIẾN').toUpperCase()

  // Up to 3 events. Each chip = "HH:MM · description" OR
  // "HH:MM — description". Split on first separator; fall back to
  // whole text as timestamp when no separator.
  const events = (chips && chips.length > 0
    ? chips
    : ['05:00 · Sáng', '12:30 · Trưa', '18:45 · Tối']
  )
    .slice(0, 3)
    .map((raw) => {
      const m = raw.match(/^(\S+?)\s*[·—\-]\s*(.+)$/)
      if (m) return { time: m[1]!.trim(), desc: m[2]!.trim() }
      return { time: raw.trim(), desc: '' }
    })

  // Each row enters on its own beat — 0.5s apart so the eye reads
  // top to bottom like a real timeline appearing.
  const rowIn = (idx: number) => {
    const start = 12 + idx * 12
    return interpolate(frame, [start, start + 14], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }

  const tagIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const headlineIn = interpolate(frame, [12 + events.length * 12, 12 + events.length * 12 + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0314' }}>
      {/* Top photo. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '38%',
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
              background:
                'linear-gradient(135deg, #4c1d95 0%, #1a0533 100%)',
            }}
          />
        )}
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.0) 50%, rgba(11,3,20,0.95) 100%)',
          }}
        />
      </div>

      {/* DIỄN BIẾN chip on the media. */}
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
        <Clock size={22 * r.unit} strokeWidth={2.5} color="#ffffff" />
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

      {/* Bottom purple plate. */}
      <div
        style={{
          position: 'absolute',
          top: '38%',
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'linear-gradient(180deg, #2e1065 0%, #1a0533 60%, #0b0314 100%)',
        }}
      />

      {/* Timeline rows — 3 events max, each = dot + line + timestamp
          + description. Vertical line drawn via a tall thin
          rgba-purple div behind the dots so it follows the column
          regardless of row count. */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(38% + 60px)',
          left: 80 * r.unit,
          right: 56 * r.unit,
          bottom: 380 * r.unit,
        }}
      >
        {/* Connector line behind the dots. Height interpolates as
            rows pop in so it doesn't dangle over empty rows. */}
        <div
          style={{
            position: 'absolute',
            left: 26 * r.unit,
            top: 18 * r.unit,
            width: 3 * r.unit,
            bottom: 18 * r.unit,
            background:
              'linear-gradient(180deg, rgba(168,85,247,0.7) 0%, rgba(168,85,247,0.15) 100%)',
            borderRadius: 2,
            transformOrigin: 'top',
            transform: `scaleY(${rowIn(events.length - 1)})`,
          }}
        />
        {events.map((ev, i) => {
          const t = rowIn(i)
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 28 * r.unit,
                marginBottom: 36 * r.unit,
                opacity: t,
                transform: `translateX(${(1 - t) * -40}px)`,
              }}
            >
              {/* Dot. */}
              <div
                style={{
                  width: 48 * r.unit,
                  height: 48 * r.unit,
                  borderRadius: '50%',
                  background:
                    'radial-gradient(circle, #facc15 0%, #ca8a04 70%)',
                  flexShrink: 0,
                  boxShadow:
                    '0 0 24px rgba(250,204,21,0.55), 0 0 0 4px rgba(76,29,149,0.85)',
                  marginTop: 4 * r.unit,
                }}
              />
              {/* Timestamp + description column. */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: 38 * r.font,
                    fontWeight: 900,
                    color: '#facc15',
                    letterSpacing: 2,
                    lineHeight: 1,
                  }}
                >
                  {ev.time}
                </div>
                {ev.desc ? (
                  <div
                    style={{
                      marginTop: 8 * r.unit,
                      fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
                      fontSize: 28 * r.font,
                      fontWeight: 600,
                      color: '#ede9fe',
                      lineHeight: 1.25,
                    }}
                  >
                    {ev.desc}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom headline summary. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 130 * r.unit,
          textAlign: 'center',
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 16}px)`,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 36 * r.font,
          fontWeight: 800,
          lineHeight: 1.2,
          color: '#ffffff',
          textShadow: '0 4px 18px rgba(0,0,0,0.6)',
        }}
      >
        {text}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
