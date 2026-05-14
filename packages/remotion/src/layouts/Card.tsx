import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * Card layout — media in a rounded card with a generous border, headline
 * sits below in its own band. Reads "magazine spread" rather than the
 * full-bleed default. Good for narrative beats where the media isn't
 * meant to dominate.
 *
 * Slots:
 *   - media (required) — fills the rounded card; KenBurns gives it
 *     subtle motion.
 *   - eyebrow (optional) — small uppercase label sitting above headline.
 *   - text (required) — headline below the card, TextBlock mode='slot'
 *     so the user's text style + font + colour all apply.
 *
 * Chips / fileId not rendered — orchestrator should pick dossierCard
 * for chip-heavy beats.
 */
export function Card({
  text,
  eyebrow,
  textStyle,
  fontOverride,
  colorOverride,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  // Card geometry: ~70% of frame height for media, 30% for text band.
  // Padded ~8% from canvas edges so the card breathes.
  const padding = 60 * r.unit
  const cardRadius = 32 * r.unit

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {/* Soft gradient base so dark frame edges feel intentional. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, #15151b 0%, #0b0b0f 60%, #0b0b0f 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding,
          gap: 32 * r.unit,
        }}
      >
        {/* Rounded media card — clips KenBurns to the radius. */}
        <div
          style={{
            position: 'relative',
            flex: '0 0 64%',
            borderRadius: cardRadius,
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          }}
        >
          {media ? (
            <KenBurns src={media.path} from={1.05} to={1.12} panX={0.02} panY={0.02} />
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
        </div>

        {/* Text band: eyebrow + headline */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: 16 * r.unit,
          }}
        >
          {eyebrow ? (
            <div
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 22 * r.font,
                fontWeight: 700,
                letterSpacing: 3,
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
        </div>
      </AbsoluteFill>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
