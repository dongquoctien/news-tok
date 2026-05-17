import { AbsoluteFill, Audio, interpolate, useCurrentFrame } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * TimestampedWar layout — field-report aesthetic for war coverage,
 * incident updates, ongoing developments. Muted army-green and steel
 * tones replace the magazine-friendly black; a LIVE dot pulses in
 * the top-left of the media frame; chips are read as a chronology
 * (e.g. "04:30 AM Tiếng nổ lớn · 05:00 AM Bộ chỉ huy phản hồi …").
 *
 * Compared to BreakingNews this layout downplays urgency and instead
 * shows a sequence of events. Best for "what happened today" body
 * keypoints rather than a one-off headline.
 *
 * Slot mapping:
 *   - media (required) — boxed upper 55%, no rounded corners, a thin
 *     steel border. KenBurns slow push-in.
 *   - text (required) — headline beneath the media on a dark plate.
 *   - chips (optional, 2-5) — chronology pills below the headline.
 *     Each is rendered as `time · event` if it contains a `:` early
 *     in the string; otherwise displayed as a regular evidence pill.
 *   - eyebrow (optional) — top status bar text (default "CHIẾN SỰ").
 *   - fileId — unused (no name tag for war coverage).
 */
export function TimestampedWar({
  text,
  eyebrow,
  chips,
  textStyle,
  fontOverride,
  colorOverride,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  // 1s pulse for the LIVE dot — matches typical news ticker cadence.
  const livePulse = interpolate(
    Math.sin((frame / 30) * Math.PI * 2),
    [-1, 1],
    [0.4, 1]
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0e0a' }}>
      {/* Concrete / dust floor — gritty olive blend. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, #1a1f1a 0%, #0e110e 70%, #050605 100%)',
        }}
      />

      {/* Top status bar — flat olive band with eyebrow text + LIVE pulse. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 70 * r.unit,
          background: 'linear-gradient(180deg, #2d3a2d 0%, #1f2a1f 100%)',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${48 * r.unit}px`,
          gap: 18 * r.unit,
          borderBottom: '2px solid #84cc16',
        }}
      >
        <span
          style={{
            width: 14 * r.unit,
            height: 14 * r.unit,
            borderRadius: '50%',
            background: '#dc2626',
            opacity: livePulse,
            boxShadow: '0 0 12px rgba(220, 38, 38, 0.6)',
          }}
        />
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 22 * r.font,
            fontWeight: 700,
            letterSpacing: 4,
            color: '#d1ffa3',
            textTransform: 'uppercase',
          }}
        >
          {eyebrow || 'CHIẾN SỰ · CẬP NHẬT TRỰC TIẾP'}
        </span>
      </div>

      {/* Media frame — sharp 90° corners, steel border. */}
      <div
        style={{
          position: 'absolute',
          top: 110 * r.unit,
          left: 48 * r.unit,
          right: 48 * r.unit,
          height: '48%',
          overflow: 'hidden',
          border: '2px solid #4d5d4d',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)',
          backgroundColor: '#0a0e0a',
        }}
      >
        {media ? (
          <KenBurns
            src={media.path}
            kind={media.kind}
            durationSec={media.durationSec}
            videoTrim={segment.videoTrim}
            loop={segment.videoLoop}
            muted={segment.videoMuted}
            volume={segment.videoVolume}
            playbackRate={segment.videoPlaybackRate}
            fit={segment.videoFit}
            align={segment.videoAlign}
            from={1.03}
            to={1.1}
            panX={-0.02}
            panY={0.02}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(135deg, #1f2a1f 0%, #0a0e0a 100%)',
            }}
          />
        )}
        {/* Tactical-style position overlay top-left — same idea as
            the BreakingNews LIVE chip but with mono font + dimmer. */}
        <div
          style={{
            position: 'absolute',
            top: 14 * r.unit,
            left: 14 * r.unit,
            padding: `${6 * r.unit}px ${12 * r.unit}px`,
            background: 'rgba(0, 0, 0, 0.75)',
            border: '1px solid #84cc16',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 14 * r.font,
            fontWeight: 700,
            letterSpacing: 2,
            color: '#d1ffa3',
            textTransform: 'uppercase',
          }}
        >
          FIELD · LIVE
        </div>
      </div>

      {/* Headline — bold uppercase on a dark plate just below media. */}
      <div
        style={{
          position: 'absolute',
          top: '64%',
          left: 48 * r.unit,
          right: 48 * r.unit,
          padding: `${20 * r.unit}px ${24 * r.unit}px`,
          background: 'rgba(0, 0, 0, 0.7)',
          borderLeft: '4px solid #84cc16',
        }}
      >
        <TextBlock
          text={text}
          style={textStyle}
          mode="slot"
          wordBoundaries={segment.wordBoundaries}
          fontOverride={fontOverride}
          colorOverride={colorOverride}
        />
      </div>

      {/* Chronology — chips stacked vertically as `time · event`
          lines. The split-by-first-colon heuristic lets the
          orchestrator pass "04:30 AM: Tiếng nổ lớn" and have it
          rendered as time-and-event without a separate field. */}
      {chips && chips.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 48 * r.unit,
            right: 48 * r.unit,
            bottom: 100 * r.unit,
            display: 'flex',
            flexDirection: 'column',
            gap: 10 * r.unit,
          }}
        >
          {chips.slice(0, 5).map((chip, i) => {
            // Match "04:30 AM: rest" or "04:30: rest" — the time prefix
            // is anything up to the first colon-space.
            const split = chip.match(/^([0-9]{1,2}:[0-9]{2}(?:\s?[AP]M)?)\s*[:·]?\s*(.+)$/)
            const time = split?.[1]
            const event = split?.[2] ?? chip
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 16 * r.unit,
                  padding: `${10 * r.unit}px ${16 * r.unit}px`,
                  background: 'rgba(132, 204, 22, 0.08)',
                  borderLeft: '2px solid #84cc16',
                }}
              >
                {time ? (
                  <span
                    style={{
                      flexShrink: 0,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: 22 * r.font,
                      fontWeight: 800,
                      color: '#84cc16',
                      letterSpacing: 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {time}
                  </span>
                ) : null}
                <span
                  style={{
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 22 * r.font,
                    fontWeight: 600,
                    color: '#e5e7eb',
                    lineHeight: 1.3,
                  }}
                >
                  {event}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Bottom: timeline graphic. Thin progress bar driven by
          segment frame so it visibly fills as the segment plays. */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60 * r.unit,
          background: '#000000',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${48 * r.unit}px`,
          gap: 20 * r.unit,
          borderTop: '1px solid #4d5d4d',
        }}
      >
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 16 * r.font,
            fontWeight: 700,
            color: '#84cc16',
            letterSpacing: 3,
          }}
        >
          UPDATE 24/7
        </span>
        <div
          style={{
            flex: 1,
            height: 4 * r.unit,
            background: '#1f2a1f',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${Math.min(100, (frame / 180) * 100)}%`,
              background: '#84cc16',
            }}
          />
        </div>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
