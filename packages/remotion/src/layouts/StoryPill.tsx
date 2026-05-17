import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * StoryPill — celebrity / lifestyle "thumbnail" look (Miu Lê style).
 *
 * Top: small rounded pill with the eyebrow text (e.g. "XIN LỖI") on a
 * white plate with dark text. Lower 65% is the photo with a strong
 * bottom-gradient. The headline sits at the bottom in big white bold
 * Be Vietnam Pro; any phrase wrapped in `**...**` inside `text` is
 * painted on a red plate so the accent (e.g. "sử dụng chất cấm") pops.
 *
 * Slot mapping:
 *   - media (required) — full-bleed background; KenBurns push-in.
 *   - eyebrow (optional) — the top pill text. Falls back to "TIN MỚI".
 *   - text (required) — headline; wrap the accent in **...**.
 *   - chips / fileId — not used.
 *
 * No TextBlock here: the headline needs custom inline-mark layout
 * that the user's TextStyle can't express. The watermark + subtitles
 * still come from the composition wrapper.
 */
export function StoryPill({
  text,
  eyebrow,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const pillLabel = (eyebrow || 'TIN MỚI').toUpperCase()
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
          from={1.06}
          to={1.14}
          panX={0}
          panY={-0.02}
          edits={segment.backgroundEdits}
        />
      ) : (
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(135deg, #1f2937 0%, #0b0b0f 100%)',
          }}
        />
      )}

      {/* Bottom darken so white text on busy photos stays legible. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.78) 78%, rgba(0,0,0,0.95) 100%)',
        }}
      />

      {/* Top pill — small white plate with dark uppercase label. */}
      <div
        style={{
          position: 'absolute',
          top: 56 * r.unit,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ffffff',
          color: '#111111',
          padding: `${10 * r.unit}px ${28 * r.unit}px`,
          borderRadius: 999,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 26 * r.font,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: 'uppercase',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          whiteSpace: 'nowrap',
        }}
      >
        {pillLabel}
      </div>

      {/* Headline — bottom-aligned, 4 lines max, big bold white with
          red-plate accent on the **...** segment. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 140 * r.unit,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8 * r.unit,
        }}
      >
        <div
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 78 * r.font,
            fontWeight: 900,
            lineHeight: 1.08,
            color: '#ffffff',
            textShadow: '0 4px 24px rgba(0,0,0,0.75)',
            textAlign: 'left',
            wordBreak: 'break-word',
          }}
        >
          {parts.map((p, i) =>
            p.kind === 'accent' ? (
              <span
                key={i}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  padding: `${4 * r.unit}px ${14 * r.unit}px`,
                  borderRadius: 8,
                  marginRight: 6 * r.unit,
                  boxDecorationBreak: 'clone',
                  WebkitBoxDecorationBreak: 'clone',
                }}
              >
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            )
          )}
        </div>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}

/**
 * Split a string on `**accent**` markers, keeping the surrounding text
 * intact. Returns an alternating sequence of plain + accent parts so
 * the layout can paint a red plate around the accent slice. Falls
 * back to a single plain part when no markers are present.
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
