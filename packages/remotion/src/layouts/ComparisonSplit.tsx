import { AbsoluteFill, Audio } from 'remotion'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * ComparisonSplit layout — two stacked rows for "before vs after" or
 * "human vs AI" framing. Top row shows media + a stat callout, bottom
 * row shows the matching chip evidence. Headline runs full width at
 * the bottom.
 *
 * Mirrors YupVid's AI THẮNG BÁC SĨ frame (hallway photo + evidence
 * overlay rows underneath).
 *
 * Differs from `splitVertical` (which is just photo-then-text) by
 * including a labelled evidence card on top of the media, so the
 * comparison reads as data rather than a hero shot.
 *
 * Slot mapping:
 *   - media (required) — top 55% of frame.
 *   - eyebrow (recommended, e.g. "EVIDENCE OVERLAY") — uppercase
 *     label of the evidence card.
 *   - fileId (optional) — monospace tag inside the evidence card.
 *   - text (required) — headline beneath via TextBlock slot.
 *   - chips (recommended, 2-3) — evidence bullet rows beneath the
 *     headline. Each chip shown with a dot indicator.
 */
export function ComparisonSplit({
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
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Top: media + evidence overlay. */}
        <div style={{ position: 'relative', flex: '0 0 55%', overflow: 'hidden' }}>
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
                filter: 'brightness(0.55) saturate(0.85)',
              }}
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(135deg, #27272f 0%, #15151b 100%)',
              }}
            />
          )}
          {/* Bottom-fade so the evidence card has contrast. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(11,11,15,0.2) 0%, rgba(11,11,15,0.8) 100%)',
            }}
          />

          {/* Evidence card pinned bottom-left of the photo. */}
          {eyebrow ? (
            <div
              style={{
                position: 'absolute',
                left: 56 * r.unit,
                bottom: 32 * r.unit,
                padding: `${14 * r.unit}px ${18 * r.unit}px`,
                background: 'rgba(11,11,15,0.85)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'baseline',
                gap: 16 * r.unit,
              }}
            >
              <span
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 18 * r.font,
                  fontWeight: 800,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: '#fbbf24',
                }}
              >
                {eyebrow}
              </span>
              {fileId ? (
                <span
                  style={{
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: 16 * r.font,
                    fontWeight: 600,
                    letterSpacing: 1,
                    color: '#f4f4f6',
                    opacity: 0.85,
                  }}
                >
                  {fileId}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Bottom: headline + chip evidence list. */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: `${40 * r.unit}px ${56 * r.unit}px`,
            gap: 20 * r.unit,
            backgroundColor: '#0b0b0f',
          }}
        >
          <TextBlock
            text={text}
            style={textStyle}
            mode="slot"
            wordBoundaries={segment.wordBoundaries}
            fontOverride={fontOverride}
            colorOverride={colorOverride}
            highlightStyle={segment.highlightStyle}
          />

          {chips && chips.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10 * r.unit,
                marginTop: 12 * r.unit,
              }}
            >
              {chips.slice(0, 4).map((chip, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12 * r.unit,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8 * r.unit,
                      height: 8 * r.unit,
                      borderRadius: 999,
                      background: '#fbbf24',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: 22 * r.font,
                      fontWeight: 600,
                      letterSpacing: 1,
                      color: '#f4f4f6',
                    }}
                  >
                    {chip}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
