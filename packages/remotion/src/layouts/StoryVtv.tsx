import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import { highlightCss } from '../effects/text/highlight-run.js'
import type { LayoutProps } from './types.js'

/**
 * StoryVtv — broadcast / "thời sự" look (VTV style).
 *
 * Channel tag (top-left) + red category chip + photo full-bleed +
 * heavy bottom darken + white headline at the bottom. Designed for
 * straight-news / weather / political segments that should feel
 * editorial, not opinion.
 *
 * Slot mapping:
 *   - media (required) — full-bleed background.
 *   - eyebrow (optional) — the small red category chip text (e.g.
 *     "TIN MỚI", "THỜI TIẾT"). Defaults to "THỜI SỰ".
 *   - fileId (optional) — channel tag text in the top-left (e.g.
 *     "VTV24"). Defaults to "NEWSTOK".
 *   - text (required) — headline; **...** marks accent (yellow).
 *   - chips — not used.
 */
export function StoryVtv({
  text,
  eyebrow,
  fileId,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const channelTag = (fileId || 'NEWSTOK').toUpperCase()
  const categoryTag = (eyebrow || 'THỜI SỰ').toUpperCase()
  const parts = splitAccent(text)

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {media ? (
        <KenBurns
          src={media.path}
          kind={media.kind}
          durationSec={media.durationSec}
          videoTrim={segment.videoTrim}
          loop={segment.videoLoop}
          muted={segment.videoMuted}
          volume={segment.videoVolume}
          audioFadeInSec={segment.videoAudioFadeInSec}
          audioFadeOutSec={segment.videoAudioFadeOutSec}
          playbackRate={segment.videoPlaybackRate}
          fit={segment.videoFit}
          align={segment.videoAlign}
          from={1.04}
          to={1.10}
          panX={0}
          panY={0.01}
          edits={segment.backgroundEdits}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0b0b0f 100%)',
          }}
        />
      )}

      {/* Bottom darken — broadcast lower-third needs a clear plate. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 45%, rgba(0,0,0,0.65) 72%, rgba(0,0,0,0.96) 100%)',
        }}
      />

      {/* Top-left channel tag — small dark plate with white channel
          text. Mirrors how broadcasters keep their channel id pinned
          regardless of segment chrome. */}
      <div
        style={{
          position: 'absolute',
          top: 48 * r.unit,
          left: 48 * r.unit,
          display: 'flex',
          alignItems: 'center',
          gap: 10 * r.unit,
          padding: `${10 * r.unit}px ${18 * r.unit}px`,
          background: 'rgba(11,11,15,0.78)',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <span
          style={{
            width: 12 * r.unit,
            height: 12 * r.unit,
            borderRadius: '50%',
            background: '#dc2626',
            boxShadow: '0 0 12px rgba(220,38,38,0.65)',
          }}
        />
        <span
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 24 * r.font,
            fontWeight: 800,
            letterSpacing: 3,
            color: '#ffffff',
            textTransform: 'uppercase',
          }}
        >
          {channelTag}
        </span>
      </div>

      {/* Red category chip — sits just under the channel tag. */}
      <div
        style={{
          position: 'absolute',
          top: 116 * r.unit,
          left: 48 * r.unit,
          padding: `${8 * r.unit}px ${16 * r.unit}px`,
          background: '#dc2626',
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 22 * r.font,
          fontWeight: 800,
          letterSpacing: 3,
          textTransform: 'uppercase',
          borderRadius: 4,
          boxShadow: '0 4px 14px rgba(220,38,38,0.45)',
        }}
      >
        {categoryTag}
      </div>

      {/* Lower-third headline — left-aligned, 4 lines max, big bold
          white. Accent phrase from **...** turns yellow. */}
      <div
        style={{
          position: 'absolute',
          left: 48 * r.unit,
          right: 48 * r.unit,
          bottom: 110 * r.unit,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 70 * r.font,
          fontWeight: 900,
          lineHeight: 1.08,
          color: '#ffffff',
          textAlign: 'left',
          textShadow: '0 4px 18px rgba(0,0,0,0.8)',
          wordBreak: 'break-word',
        }}
      >
        {parts.map((p, i) => {
          if (p.kind !== 'accent') return <span key={i}>{p.text}</span>
          // segment.highlightStyle override path — same as StoryPill /
          // StoryChip. Legacy yellow remains the default.
          const css = segment.highlightStyle
            ? highlightCss(segment.highlightStyle, r.unit)
            : { color: '#facc15' }
          return (
            <span key={i} style={css}>
              {p.text}
            </span>
          )
        })}
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
