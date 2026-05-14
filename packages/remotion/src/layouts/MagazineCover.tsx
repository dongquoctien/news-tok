import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * MagazineCover layout — full-bleed photo, huge serif headline anchored
 * to the bottom-left so it overlaps the image; tiny tracking-wide
 * eyebrow up top with a thin top rule.
 *
 * Reads as a glossy magazine cover or editorial spread. The vignette
 * darkens the bottom band specifically so the headline stays legible
 * even on noisy photos.
 *
 * Slots:
 *   - media (required) — full-bleed background, slow KenBurns push-in.
 *   - eyebrow (optional) — "ISSUE 04 · MAR 2026"-style metadata,
 *     hairline rule below.
 *   - fileId (optional) — small uppercase label rendered next to the
 *     eyebrow when both are set, e.g. "VOL. 12".
 *   - text (required) — headline TextBlock mode='slot'. Layout
 *     constrains it to ~85% width so it doesn't run to the edge.
 *
 * Chips not rendered — use dossierCard for evidence beats.
 */
export function MagazineCover({
  text,
  eyebrow,
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
      {/* Full-bleed media with slow push-in. */}
      {media ? (
        <KenBurns src={media.path} from={1.0} to={1.08} panX={0} panY={-0.02} />
      ) : (
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(135deg, #15151b 0%, #27272f 100%)',
          }}
        />
      )}
      {/* Bottom-heavy vignette to keep headline legible. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,11,15,0.65) 0%, rgba(11,11,15,0.0) 30%, rgba(11,11,15,0.0) 50%, rgba(11,11,15,0.85) 100%)',
        }}
      />

      {/* Top-left eyebrow + fileId block. */}
      {eyebrow || fileId ? (
        <div
          style={{
            position: 'absolute',
            top: 64 * r.unit,
            left: 64 * r.unit,
            right: 64 * r.unit,
            display: 'flex',
            flexDirection: 'column',
            gap: 12 * r.unit,
          }}
        >
          <div style={{ height: 2, width: 96 * r.unit, background: '#ffffff' }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 24 * r.unit,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 22 * r.font,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#ffffff',
            }}
          >
            {eyebrow ? <span>{eyebrow}</span> : null}
            {fileId ? (
              <span
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  color: '#a5b4fc',
                  letterSpacing: 2,
                }}
              >
                {fileId}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Headline anchored bottom-left. Width clamp keeps it tight. */}
      <div
        style={{
          position: 'absolute',
          left: 64 * r.unit,
          right: 64 * r.unit,
          bottom: 96 * r.unit,
          maxWidth: '85%',
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
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
