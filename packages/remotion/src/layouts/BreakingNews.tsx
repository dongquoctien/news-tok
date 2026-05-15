import { AbsoluteFill, Audio, interpolate, useCurrentFrame } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * BreakingNews layout — the cable-channel "we interrupt your broadcast"
 * look. A solid red banner at the top anchors urgency, the media
 * occupies the upper 55% in its own framed box, headline sits on a
 * dark plate immediately below with a soft blue drop shadow, and a
 * footer ribbon carries the channel mark.
 *
 * Best for hard-news segments that need to feel time-critical: court
 * verdicts dropping, breaking incident updates, election calls. The
 * red banner also pulses subtly so a viewer scrolling past stops.
 *
 * Slot mapping:
 *   - media (required) — boxed inside a frame; KenBurns push-in.
 *   - eyebrow (optional) — overrides the default "BREAKING NEWS"
 *     ribbon text. Use a topic tag like "TIN TỨC PHÁP LUẬT".
 *   - text (required) — headline TextBlock mode='slot'.
 *   - chips not rendered — use timestampedWar for ticker-style tags.
 */
export function BreakingNews({
  text,
  eyebrow,
  textStyle,
  fontOverride,
  colorOverride,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  // Slow 1.2s breathing pulse on the banner — just enough motion to
  // catch the eye without strobing. interpolate avoids requestAnimationFrame.
  const pulse = interpolate(
    Math.sin((frame / 36) * Math.PI * 2),
    [-1, 1],
    [0.88, 1]
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {/* Subtle blue-gray gradient floor so the framed media doesn't
          float against pure black. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, #15151b 0%, #1a1f2e 70%, #0b0b0f 100%)',
        }}
      />

      {/* Top red banner — the "BREAKING" cue. Solid red so it reads
          even in dark mode preview thumbnails. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 110 * r.unit,
          background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pulse,
          boxShadow: '0 4px 24px rgba(220, 38, 38, 0.45)',
          zIndex: 4,
        }}
      >
        <span
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 40 * r.font,
            fontWeight: 900,
            letterSpacing: 6,
            color: '#ffffff',
            textTransform: 'uppercase',
          }}
        >
          {eyebrow || 'BREAKING NEWS'}
        </span>
      </div>

      {/* Media frame — upper 55%. Bordered + cast shadow so it reads
          as an inset broadcast box rather than fullbleed. */}
      <div
        style={{
          position: 'absolute',
          top: 160 * r.unit,
          left: 56 * r.unit,
          right: 56 * r.unit,
          height: '52%',
          overflow: 'hidden',
          borderRadius: 12,
          border: '3px solid rgba(255, 255, 255, 0.18)',
          boxShadow:
            '0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(220, 38, 38, 0.25)',
          backgroundColor: '#0b0b0f',
        }}
      >
        {media ? (
          <KenBurns
            src={media.path}
            from={1.05}
            to={1.12}
            panX={0}
            panY={0.02}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            }}
          />
        )}
        {/* Tiny "LIVE" dot in the top-left of the frame — fires only
            after the banner is fully painted (delay 6 frames) to avoid
            stealing focus on cold mount. */}
        <div
          style={{
            position: 'absolute',
            top: 16 * r.unit,
            left: 16 * r.unit,
            display: 'flex',
            alignItems: 'center',
            gap: 8 * r.unit,
            padding: `${6 * r.unit}px ${14 * r.unit}px`,
            background: 'rgba(0, 0, 0, 0.7)',
            borderRadius: 4,
          }}
        >
          <span
            style={{
              width: 12 * r.unit,
              height: 12 * r.unit,
              borderRadius: '50%',
              background: '#dc2626',
              opacity: pulse,
            }}
          />
          <span
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 14 * r.font,
              fontWeight: 800,
              letterSpacing: 2,
              color: '#ffffff',
            }}
          >
            LIVE
          </span>
        </div>
      </div>

      {/* Headline plate — sits below media on a dark band, blue drop
          shadow keeps it crisp on any photo behind. */}
      <div
        style={{
          position: 'absolute',
          top: '70%',
          left: 56 * r.unit,
          right: 56 * r.unit,
          maxWidth: '90%',
          filter: 'drop-shadow(0 4px 24px rgba(37, 99, 235, 0.55))',
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

      {/* Footer ribbon — channel mark left, update cadence right.
          Hard-styled (not user-controlled) to keep the chrome
          consistent across renders. */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 80 * r.unit,
          background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${56 * r.unit}px`,
          borderTop: '2px solid rgba(220, 38, 38, 0.5)',
        }}
      >
        <span
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 22 * r.font,
            fontWeight: 700,
            letterSpacing: 4,
            color: '#cbd5f5',
            textTransform: 'uppercase',
          }}
        >
          CẬP NHẬT 24/7
        </span>
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 18 * r.font,
            fontWeight: 600,
            color: '#ffffff',
            opacity: 0.7,
          }}
        >
          NEWS · LIVE
        </span>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
