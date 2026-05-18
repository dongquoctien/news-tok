import { AbsoluteFill, Audio } from 'remotion'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * StatHero layout — typography-only hero, designed for beats with a
 * standout number (e.g. "47%", "$2.1B", "10x"). No media required;
 * the background is a soft mesh gradient so the type carries the
 * whole frame.
 *
 * Slot mapping:
 *   - eyebrow (optional) — small uppercase label above the headline,
 *     accent-coloured.
 *   - text (required) — the standout itself. Renders huge through
 *     TextBlock mode='slot' so the user's font + colour + decorators
 *     (e.g. text stroke, gradient fill) all apply.
 *   - chips (optional) — up to 3 small pills under the headline,
 *     e.g. ["FY 2026", "YoY GROWTH"]. Hard-styled, no user TextStyle.
 *   - fileId (optional) — tiny monospace label top-right, e.g.
 *     "PRIMARY METRIC".
 *   - media: ignored. statHero is type-only by design — pass it to a
 *     media-led layout if you have a photo.
 */
export function StatHero({
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
  const narration = segment.audio?.narration

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse at 30% 20%, #1e1b4b 0%, #0b0b0f 60%), radial-gradient(ellipse at 80% 80%, #312e81 0%, transparent 50%)',
      }}
    >
      {/* fileId top-right */}
      {fileId ? (
        <div
          style={{
            position: 'absolute',
            top: 64 * r.unit,
            right: 64 * r.unit,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 22 * r.font,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: '#a5b4fc',
          }}
        >
          {fileId}
        </div>
      ) : null}

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 64 * r.unit,
          gap: 24 * r.unit,
          textAlign: 'center',
        }}
      >
        {eyebrow ? (
          <div
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 26 * r.font,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#a5b4fc',
            }}
          >
            {eyebrow}
          </div>
        ) : null}

        {/* Headline — typography-first, full force of user text style.
            fontVariantNumeric forces digit columns to align so big
            numbers don't dance frame-to-frame. */}
        <div style={{ fontVariantNumeric: 'tabular-nums' }}>
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

        {chips && chips.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 12 * r.unit,
              marginTop: 16 * r.unit,
            }}
          >
            {chips.slice(0, 3).map((chip, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  padding: `${10 * r.unit}px ${22 * r.unit}px`,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 22 * r.font,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#ffffff',
                  background: 'rgba(99, 102, 241, 0.18)',
                  border: '1px solid rgba(165, 180, 252, 0.4)',
                  borderRadius: 999,
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </AbsoluteFill>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
