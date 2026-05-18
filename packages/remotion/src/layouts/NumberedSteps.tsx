import { AbsoluteFill, Audio } from 'remotion'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NumberedSteps layout — bold red headline plate at top with a
 * "01 / 02 / 03" step list underneath. Best for beats that
 * enumerate consequences or steps in a sequence.
 *
 * Mirrors YupVid's CHIP AI HUAWEI CHÁY HÀNG frame (red plate
 * headline + numbered step rows).
 *
 * Slot mapping:
 *   - media (optional) — small thumbnail next to the title plate.
 *     Defaults to a gradient when absent.
 *   - eyebrow (optional) — small uppercase line above the plate.
 *   - text (required) — headline rendered in the red plate via
 *     TextBlock mode='slot'.
 *   - chips (recommended, 2-4) — rendered as numbered steps "01 /
 *     02 / 03" with the chip text as the step label.
 *   - fileId (optional) — monospace badge to the right of the
 *     eyebrow ("TRUNG QUỐC BỨT PHÁ").
 */
export function NumberedSteps({
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
      {/* Background: dim media if provided, otherwise a moody gradient. */}
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
            filter: 'brightness(0.35) saturate(0.8)',
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(ellipse at 70% 20%, #1f1f2a 0%, #0b0b0f 70%)',
          }}
        />
      )}

      {/* Eyebrow + fileId, top */}
      {eyebrow || fileId ? (
        <div
          style={{
            position: 'absolute',
            top: 56 * r.unit,
            left: 56 * r.unit,
            right: 56 * r.unit,
            display: 'flex',
            alignItems: 'center',
            gap: 16 * r.unit,
          }}
        >
          {eyebrow ? (
            <span
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 20 * r.font,
                fontWeight: 800,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: '#fef3c7',
              }}
            >
              {eyebrow}
            </span>
          ) : null}
          {fileId ? (
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 18 * r.font,
                fontWeight: 600,
                letterSpacing: 2,
                color: '#ef4444',
                padding: `${4 * r.unit}px ${10 * r.unit}px`,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 4,
              }}
            >
              {fileId}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Red plate with headline — middle-top. */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: 56 * r.unit,
          right: 56 * r.unit,
          background:
            'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
          borderRadius: 8,
          padding: `${32 * r.unit}px ${36 * r.unit}px`,
          boxShadow: '0 24px 60px rgba(239, 68, 68, 0.25)',
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
      </div>

      {/* Numbered step rows */}
      {chips && chips.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 56 * r.unit,
            right: 56 * r.unit,
            top: '50%',
            display: 'flex',
            flexDirection: 'column',
            gap: 14 * r.unit,
          }}
        >
          {chips.slice(0, 5).map((chip, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18 * r.unit,
                padding: `${14 * r.unit}px ${20 * r.unit}px`,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <span
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: 26 * r.font,
                  fontWeight: 800,
                  color: '#ef4444',
                  minWidth: 48 * r.unit,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 22 * r.font,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: '#f4f4f6',
                }}
              >
                {chip}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
