import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * SplitVertical layout — media bleeds the top 60% of the frame, text
 * lives on a solid dark band underneath (no card chrome, no rounded
 * corners). Reads as "headline + photo" newspaper-style without the
 * full-bleed gradient softening the photo.
 *
 * Slots:
 *   - media (required) — top 60% of frame, full-bleed.
 *   - eyebrow (optional) — uppercase label above headline.
 *   - text (required) — headline rendered via TextBlock mode='slot'.
 *
 * Chips / fileId not rendered.
 */
export function SplitVertical({
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

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Top: media region (60% height) */}
        <div style={{ position: 'relative', flex: '0 0 60%', overflow: 'hidden' }}>
          {media ? (
            <KenBurns src={media.path} from={1.06} to={1.0} panX={0} panY={0.02} />
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

        {/* Bottom: text band (40% height) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: `${48 * r.unit}px ${72 * r.unit}px`,
            gap: 20 * r.unit,
            backgroundColor: '#0b0b0f',
          }}
        >
          {eyebrow ? (
            <div
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 24 * r.font,
                fontWeight: 800,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: '#ef4444',
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
