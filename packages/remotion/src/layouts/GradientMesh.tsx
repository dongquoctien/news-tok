import { AbsoluteFill, Audio } from 'remotion'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * GradientMesh layout — typography-only frame, multi-stop radial
 * gradient background that fades from peach → coral → indigo →
 * black. Headline is centred over the mesh, with "chat bubble"-style
 * chips beneath.
 *
 * Mirrors YupVid's TOTO LÀM CHIP AI frame (orange-pink gradient, chip
 * boxes asking "HÀNG BỎN CẦU NỐI TIẾNG" / "BƯỚC VÀO CHUỖI BÁN DẪN").
 *
 * Slot mapping:
 *   - media: ignored. The frame is type-only by design — the gradient
 *     mesh carries the entire visual.
 *   - eyebrow (optional) — tiny tag pinned top-left.
 *   - text (required) — headline anchored centred-bottom via
 *     TextBlock slot. Best when headline is short (≤5 words).
 *   - chips (recommended, 2-4) — rendered as floating "speech bubble"
 *     rounded rects above the headline.
 *   - fileId: ignored.
 */
export function GradientMesh({
  text,
  eyebrow,
  chips,
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
          'radial-gradient(ellipse at 30% 15%, #fde68a 0%, transparent 40%), radial-gradient(ellipse at 80% 30%, #fbcfe8 0%, transparent 45%), radial-gradient(ellipse at 50% 70%, #c7d2fe 0%, transparent 55%), linear-gradient(180deg, #fcd34d 0%, #f97316 35%, #6366f1 75%, #0b0b0f 100%)',
      }}
    >
      {/* Eyebrow pill, top-left. */}
      {eyebrow ? (
        <div
          style={{
            position: 'absolute',
            top: 56 * r.unit,
            left: 56 * r.unit,
            padding: `${8 * r.unit}px ${18 * r.unit}px`,
            background: 'rgba(11,11,15,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderRadius: 999,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 18 * r.font,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: '#fef3c7',
          }}
        >
          {eyebrow}
        </div>
      ) : null}

      {/* Chat-bubble chips, middle. */}
      {chips && chips.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 56 * r.unit,
            right: 56 * r.unit,
            top: '20%',
            display: 'flex',
            flexDirection: 'column',
            gap: 16 * r.unit,
            alignItems: 'flex-end',
          }}
        >
          {chips.slice(0, 4).map((chip, i) => (
            <div
              key={i}
              style={{
                maxWidth: '78%',
                padding: `${14 * r.unit}px ${22 * r.unit}px`,
                background: 'rgba(11,11,15,0.75)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: 24,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 24 * r.font,
                fontWeight: 700,
                color: '#fef3c7',
                letterSpacing: 1,
                textTransform: 'uppercase',
                // Alternate alignment so the chips read as a
                // conversation thread rather than a list.
                alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end',
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      ) : null}

      {/* Headline near the bottom. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 120 * r.unit,
          textAlign: 'center',
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
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
