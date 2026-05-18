import { AbsoluteFill, Audio } from 'remotion'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * CrtTerminal layout — retro CRT monitor frame with a typewriter-ish
 * vibe. Headline + caption rendered inside a "terminal" with scanline
 * overlay and slight chromatic-aberration glow.
 *
 * Mirrors YupVid's KHƠI MỞ frame (vintage CRT screen with text + tag
 * lines at the bottom).
 *
 * Slot mapping:
 *   - media (optional) — fills the CRT screen; gradient fallback when
 *     absent.
 *   - eyebrow (recommended, e.g. "PRIMARY METRIC") — uppercase line
 *     pinned top-left inside the screen.
 *   - fileId (optional) — terminal "prompt", e.g. "> LIVE EP: 8 / OS 4".
 *   - text (required) — headline inside the screen via TextBlock slot.
 *   - chips (recommended, 2-3) — small tag rows below the headline,
 *     monospace, separated by " — ".
 */
export function CrtTerminal({
  text,
  eyebrow,
  chips,
  fileId,
  textStyle,
  fontOverride,
  colorOverride,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {/* Outer wall: faux desk surface. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% 60%, #1a1a22 0%, #0b0b0f 80%)',
        }}
      />

      {/* CRT bezel — slightly rounded with a subtle inner glow. */}
      <div
        style={{
          position: 'absolute',
          left: 64 * r.unit,
          right: 64 * r.unit,
          top: 96 * r.unit,
          bottom: 96 * r.unit,
          borderRadius: 24 * r.unit,
          border: `${10 * r.unit}px solid #2a2a35`,
          background: '#0b0b0f',
          boxShadow:
            'inset 0 0 60px rgba(34, 197, 94, 0.18), 0 32px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Optional photo behind the terminal text, dim. */}
        {media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.path}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'brightness(0.35) saturate(0.6) hue-rotate(-10deg)',
            }}
          />
        ) : null}

        {/* Scanlines overlay — repeating linear-gradient is the cheap
            CSS trick for the retro vibe; opacity kept low so the text
            still reads. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-linear-gradient(0deg, rgba(34, 197, 94, 0.05) 0px, rgba(34, 197, 94, 0.05) 2px, transparent 2px, transparent 4px)',
            pointerEvents: 'none',
          }}
        />

        {/* Terminal content: prompt + headline + chips. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: 40 * r.unit,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            {eyebrow ? (
              <div
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: 20 * r.font,
                  fontWeight: 700,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: '#22c55e',
                  marginBottom: 12 * r.unit,
                  opacity: 0.85,
                }}
              >
                {eyebrow}
              </div>
            ) : null}
            {fileId ? (
              <div
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: 18 * r.font,
                  fontWeight: 500,
                  color: '#86efac',
                  opacity: 0.7,
                  marginBottom: 24 * r.unit,
                }}
              >
                {`> ${fileId}`}
              </div>
            ) : null}
          </div>

          {/* Headline anchored centre-vertical-ish via flex grow. */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <TextBlock
              text={text}
              style={textStyle}
              mode="slot"
              wordBoundaries={segment.wordBoundaries}
              fontOverride={fontOverride}
              colorOverride={colorOverride}
              highlightStyle={segment.highlightStyle}
            />
          </div>

          {/* Chip tags as monospace "log lines". */}
          {chips && chips.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12 * r.unit,
                marginTop: 16 * r.unit,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 18 * r.font,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#86efac',
              }}
            >
              {chips.slice(0, 4).map((chip, i) => (
                <span key={i}>
                  {chip}
                  {i < Math.min(chips.length, 4) - 1 ? (
                    <span style={{ marginLeft: 8 * r.unit, opacity: 0.5 }}>—</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
