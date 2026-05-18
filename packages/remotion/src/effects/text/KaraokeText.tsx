import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'
import { highlightCss } from './highlight-run.js'

/**
 * Karaoke caption — each word animates in sync with `wordBoundaries`
 * produced by Edge TTS. Three modes, controlled by `style.karaokeMode`:
 *
 *   - `fill`       (default) idle words show in `karaokeIdleColor` (or
 *                  dimmed style color), active word swaps to
 *                  `karaokeAccentColor`. Already-spoken words inherit the
 *                  style's main color so the eye tracks the reading head.
 *   - `pop`        same color rule, plus a quick spring scale 1.0 → 1.18
 *                  → 1.0 when the word fires. Great for Hormozi captions.
 *   - `underline`  draws an animated underline beneath the word currently
 *                  being spoken (left-to-right wipe during the word's
 *                  duration).
 *
 * Without `wordBoundaries` we fall back to a static render — better than
 * a hidden block, and a UX hint that this style needs TTS metadata.
 */
export const KaraokeText = ({
  text,
  parts,
  wordHighlightMask,
  highlightStyle,
  style,
  wordBoundaries,
  fontOverride,
  colorOverride,
}: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const mode = style.karaokeMode ?? 'fill'
  // Override priority: colorOverride.accent → style.karaokeAccentColor →
  // hard-coded yellow. Same idea for idle.
  const accent = colorOverride?.accent ?? style.karaokeAccentColor ?? '#fde047'
  const idle = colorOverride?.idle ?? style.karaokeIdleColor ?? 'rgba(255,255,255,0.32)'

  const base = typographyStyle(style, style.fontSize * r.font, fontOverride, colorOverride)
  // Body color used for the "already spoken" state. typographyStyle()
  // already applied the override to `base.color`; mirror it here so the
  // ternary below uses the same value.
  const spokenColor = colorOverride?.primary ?? style.color

  if (!wordBoundaries || wordBoundaries.length === 0) {
    return (
      <div style={{ ...base, display: 'block' }}>
        {parts && highlightStyle
          ? parts.map((p, i) =>
              p.highlighted ? (
                <span key={i} style={highlightCss(highlightStyle, r.unit)}>{p.text}</span>
              ) : (
                <span key={i}>{p.text}</span>
              )
            )
          : text}
      </div>
    )
  }

  return (
    <div style={{ ...base, display: 'block' }}>
      {wordBoundaries.map((wb, i) => {
        const start = wb.offsetSec * fps
        const end = (wb.offsetSec + wb.durationSec) * fps
        const isActive = frame >= start && frame <= end
        const isSpoken = frame > end

        // Color: idle → accent (active) → spokenColor (after the word).
        const color = isActive ? accent : isSpoken ? spokenColor : idle

        // Pop scale for `pop` mode only. Spring rises during the word's
        // own window so the pop reads even on short words.
        let transform = 'none'
        if (mode === 'pop' && isActive) {
          const local = spring({
            frame: frame - start,
            fps,
            config: { damping: 9, mass: 0.55, stiffness: 160 },
            durationInFrames: Math.max(6, Math.round(wb.durationSec * fps)),
          })
          // local: 0→1 over the word. Bell curve so it overshoots then
          // settles at 1.0 inside the same window.
          const bell = local < 0.5 ? local * 2 : (1 - local) * 2
          const scale = 1 + bell * 0.18
          transform = `scale(${scale})`
        }

        // Underline draw: 0 → wordWidth across the spoken duration.
        const underlineFrac = isActive
          ? Math.min(1, (frame - start) / Math.max(1, end - start))
          : isSpoken
            ? 1
            : 0
        const underlineWidth = mode === 'underline' ? `${underlineFrac * 100}%` : '0%'

        const isFlagged = highlightStyle && wordHighlightMask?.[i]
        const hcss = isFlagged ? highlightCss(highlightStyle, r.unit) : undefined
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              color,
              transform,
              transformOrigin: 'center bottom',
              marginRight: '0.28em',
              whiteSpace: 'nowrap',
              position: 'relative',
              transition: 'none',
              // Highlight repaint (plate / underline / glow + bold).
              // Karaoke `color` and `transform` above stay authoritative
              // for the live reading position, so we apply the highlight
              // background / weight / italic on top without disturbing
              // colour transitions.
              ...hcss,
              ...(isActive ? { color } : {}),
            }}
          >
            {wb.text}
            {mode === 'underline' ? (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 'auto',
                  bottom: `-${Math.max(2, r.unit * 1.2)}px`,
                  height: `${Math.max(3, r.unit * 1.6)}px`,
                  width: underlineWidth,
                  background: accent,
                  borderRadius: 2,
                }}
              />
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
