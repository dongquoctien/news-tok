import { AbsoluteFill, Audio } from 'remotion'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NeonSign layout — bold pink/orange neon "sign" emblem at the top
 * with glow, sitting over a desaturated media background; chips
 * underneath show as labeled metadata rows.
 *
 * Mirrors YupVid's RUFLO LÀ GÌ frame (yellow neon "uFlo" sign on a
 * dark table, evidence-style rows underneath).
 *
 * Slot mapping:
 *   - media (optional) — dimmed background; gradient fallback when
 *     absent.
 *   - fileId (recommended) — the neon "sign text" itself, e.g.
 *     "uFlo" / "Gemini". Rendered huge, neon-styled, NOT subject to
 *     user text style.
 *   - eyebrow (optional) — small uppercase label above the headline.
 *   - text (required) — headline below the sign via TextBlock slot.
 *   - chips (optional, 2-4) — metadata rows (e.g. "BA NỀN — OPEN
 *     SOURCE") underneath the headline. Each chip rendered as a
 *     small uppercase tag with a divider.
 */
export function NeonSign({
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
      {/* Background media, heavily darkened. */}
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
            filter: 'brightness(0.4) saturate(0.7)',
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(ellipse at 50% 30%, #2a1a3a 0%, #0b0b0f 70%)',
          }}
        />
      )}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,11,15,0.4) 0%, rgba(11,11,15,0.7) 100%)',
        }}
      />

      {/* Neon sign emblem, top-third. */}
      {fileId ? (
        <div
          style={{
            position: 'absolute',
            top: '12%',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: '"Bebas Neue", "Arial Narrow", sans-serif',
              fontSize: 168 * r.font,
              fontWeight: 400,
              letterSpacing: 8,
              color: '#fbbf24',
              // Layered glow — two text-shadows give the neon halo
              // without needing an SVG filter (which Remotion can't
              // reliably resolve across renderers).
              textShadow:
                '0 0 18px rgba(251, 191, 36, 0.8), 0 0 36px rgba(251, 191, 36, 0.6), 0 0 72px rgba(245, 158, 11, 0.45)',
            }}
          >
            {fileId}
          </div>
        </div>
      ) : null}

      {/* Headline + eyebrow centered lower. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          top: '52%',
        }}
      >
        {eyebrow ? (
          <div
            style={{
              marginBottom: 16 * r.unit,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 22 * r.font,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#fbbf24',
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
          highlightStyle={segment.highlightStyle}
        />
      </div>

      {/* Chip evidence rows along the bottom. */}
      {chips && chips.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 56 * r.unit,
            right: 56 * r.unit,
            bottom: 96 * r.unit,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12 * r.unit,
            borderTop: '1px solid rgba(251, 191, 36, 0.3)',
            paddingTop: 16 * r.unit,
          }}
        >
          {chips.slice(0, 4).map((chip, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 18 * r.font,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#fef3c7',
              }}
            >
              {chip}
              {i < Math.min(chips.length, 4) - 1 ? (
                <span style={{ marginLeft: 12 * r.unit, color: '#fbbf24' }}>·</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
