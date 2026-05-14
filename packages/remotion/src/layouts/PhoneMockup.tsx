import { AbsoluteFill, Audio } from 'remotion'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * PhoneMockup layout — frames the media inside a stylised phone bezel
 * and stacks "file id" chips beside it (think YupVid's META RA MẮT
 * frame: phone with stacked AUTODATA / FRAMEWORK AGENTIC / LLM TỰ TẠO
 * DỮ LIỆU file tags).
 *
 * Slot mapping:
 *   - media (required) — fills the phone screen, KenBurns disabled
 *     so the device feels static while the screen "shows" the photo.
 *   - eyebrow (recommended, e.g. "PROFILE ID") — small uppercase label
 *     above the headline.
 *   - text (required) — headline anchored bottom-right of the frame,
 *     via TextBlock mode='slot'.
 *   - chips (recommended, 2-4) — vertical stack of "FILE 01 / FILE 02"
 *     tags to the right of the phone.
 *   - fileId: ignored (chips cover the same purpose).
 */
export function PhoneMockup({
  text,
  eyebrow,
  chips,
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
      {/* Vignette / mood background. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 30% 30%, #1f1f2a 0%, #0b0b0f 60%)',
        }}
      />

      {/* Phone bezel — sits on the left ~55% of the frame. */}
      <div
        style={{
          position: 'absolute',
          left: `${10}%`,
          top: `${12}%`,
          width: '36%',
          height: '76%',
          borderRadius: 48 * r.unit,
          border: `${4 * r.unit}px solid #27272f`,
          background: '#0b0b0f',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        {/* Notch */}
        <div
          style={{
            position: 'absolute',
            top: 12 * r.unit,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '32%',
            height: 18 * r.unit,
            borderRadius: 999,
            background: '#0b0b0f',
            zIndex: 2,
          }}
        />
        {/* Screen */}
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
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, #1d1d25 0%, #15151b 100%)',
            }}
          />
        )}
      </div>

      {/* Right rail: eyebrow + headline + chips stack */}
      <div
        style={{
          position: 'absolute',
          right: 64 * r.unit,
          top: '20%',
          width: '42%',
          display: 'flex',
          flexDirection: 'column',
          gap: 20 * r.unit,
        }}
      >
        {eyebrow ? (
          <div
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 20 * r.font,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#a5b4fc',
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <TextBlock
          text={text}
          style={textStyle}
          mode="slot"
          wordBoundaries={segment.wordBoundaries}
          fontOverride={fontOverride}
          colorOverride={colorOverride}
        />

        {chips && chips.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 * r.unit }}>
            {chips.slice(0, 5).map((chip, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12 * r.unit,
                  padding: `${10 * r.unit}px ${16 * r.unit}px`,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: 16 * r.font,
                    fontWeight: 600,
                    color: '#a5b4fc',
                    minWidth: 56 * r.unit,
                  }}
                >
                  {`FILE ${String(i + 1).padStart(2, '0')}`}
                </span>
                <span
                  style={{
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 18 * r.font,
                    fontWeight: 600,
                    color: '#f4f4f6',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {chip}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
