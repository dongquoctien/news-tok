import {
  AbsoluteFill,
  Audio,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointComparison — before/after split keypoint.
 *
 * Use when the segment juxtaposes two things: before / after a fire,
 * 2023 vs 2026 stats, the original vs the fake, etc. Two media
 * panes stacked vertically with chip labels so the eye reads the
 * comparison in 2 seconds.
 *
 * Composition:
 *   - Top half: media #1 (segment.visuals.background) with KenBurns
 *     push, TRƯỚC chip top-left of its frame, soft purple separator
 *     gradient at the bottom edge.
 *   - Bottom half: media #2 from segment.visuals.foreground[0] —
 *     OR fallback to a brand gradient when no second media is set,
 *     SAU chip top-left. Foreground is the existing schema slot
 *     for "additional media on top of the background"; it doubles
 *     as the "after" frame for comparison.
 *   - Headline pinned at the very bottom on a thin purple plate.
 *
 * Slot mapping:
 *   - media (segment.visuals.background, required) — top frame
 *     "before" photo.
 *   - segment.visuals.foreground[0] (optional but recommended) —
 *     bottom frame "after" photo. Falls back to brand gradient.
 *   - chips (optional, exactly 2 entries) — chip labels for the
 *     two frames. Defaults to ["TRƯỚC", "SAU"]. Truncated/padded
 *     to length 2.
 *   - text (required) — bottom headline plate.
 *   - eyebrow / fileId — not used.
 */
export function NewstokvnKeypointComparison({
  text,
  chips,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const frame = useCurrentFrame()
  const beforeMedia = segment.visuals.background
  const afterMedia = segment.visuals.foreground?.[0]
  const narration = segment.audio?.narration

  // Two chip labels — default TRƯỚC / SAU, override via chips[].
  // Cap at 2 entries; pad short input with defaults so the layout
  // never renders an empty chip on one side.
  const labels: [string, string] = (() => {
    const provided = chips ?? []
    const a = (provided[0] || 'TRƯỚC').toUpperCase()
    const b = (provided[1] || 'SAU').toUpperCase()
    return [a, b]
  })()

  // Frames slide in: top from above, bottom from below; staggered.
  const topIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const bottomIn = interpolate(frame, [8, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const headlineIn = interpolate(frame, [22, 38], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0314' }}>
      {/* TOP frame (before). */}
      <div
        style={{
          position: 'absolute',
          top: r.square ? '4%' : 56 * r.unit,
          left: '4%',
          right: '4%',
          // Square has less vertical room; pull each frame to 32% so
          // the VS dot + bottom headline plate still breathe.
          height: r.square ? '32%' : '40%',
          overflow: 'hidden',
          borderRadius: 12,
          border: '3px solid rgba(168,85,247,0.55)',
          boxShadow:
            '0 18px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(168,85,247,0.25)',
          backgroundColor: '#1a0533',
          opacity: topIn,
          transform: `translateY(${(1 - topIn) * -30}px)`,
        }}
      >
        {beforeMedia ? (
          <KenBurns
            src={beforeMedia.path}
            from={1.04}
            to={1.10}
            panX={0}
            panY={0.02}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(135deg, #4c1d95 0%, #1a0533 100%)',
            }}
          />
        )}
        {/* TRƯỚC chip top-left. */}
        <div
          style={{
            position: 'absolute',
            top: 14 * r.unit,
            left: 14 * r.unit,
            padding: `${6 * r.unit}px ${14 * r.unit}px`,
            background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
            color: '#ffffff',
            borderRadius: 4,
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: r.safeFont(22),
            fontWeight: 900,
            letterSpacing: 3,
            textTransform: 'uppercase',
            boxShadow: '0 6px 16px rgba(239,68,68,0.5)',
          }}
        >
          {labels[0]}
        </div>
      </div>

      {/* Arrow-down separator in the middle — purely decorative,
          tells the eye "compare these two". */}
      <div
        style={{
          position: 'absolute',
          // First frame ends at (top% + height%). VS dot sits in the
          // gap above the second frame.
          top: r.square ? 'calc(4% + 32% + 10px)' : 'calc(40% + 80px)',
          left: '50%',
          transform: `translateX(-50%) translateY(${(1 - bottomIn) * -8}px)`,
          opacity: bottomIn,
          width: 64 * r.unit,
          height: 64 * r.unit,
          borderRadius: '50%',
          background:
            'linear-gradient(180deg, #facc15 0%, #ca8a04 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0b0314',
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: r.safeFont(32),
          fontWeight: 900,
          boxShadow:
            '0 10px 28px rgba(250,204,21,0.55), 0 0 0 4px rgba(11,3,20,0.65)',
          zIndex: 5,
        }}
      >
        VS
      </div>

      {/* BOTTOM frame (after). */}
      <div
        style={{
          position: 'absolute',
          top: r.square ? 'calc(4% + 32% + 70px)' : 'calc(40% + 130px)',
          left: '4%',
          right: '4%',
          height: r.square ? '32%' : '40%',
          overflow: 'hidden',
          borderRadius: 12,
          border: '3px solid rgba(250,204,21,0.55)',
          boxShadow:
            '0 18px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(250,204,21,0.25)',
          backgroundColor: '#1a0533',
          opacity: bottomIn,
          transform: `translateY(${(1 - bottomIn) * 30}px)`,
        }}
      >
        {afterMedia ? (
          <KenBurns
            src={afterMedia.path}
            from={1.04}
            to={1.10}
            panX={0}
            panY={-0.02}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(135deg, #1a0533 0%, #4c1d95 100%)',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: 14 * r.unit,
            left: 14 * r.unit,
            padding: `${6 * r.unit}px ${14 * r.unit}px`,
            background: 'linear-gradient(180deg, #facc15 0%, #ca8a04 100%)',
            color: '#0b0314',
            borderRadius: 4,
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: r.safeFont(22),
            fontWeight: 900,
            letterSpacing: 3,
            textTransform: 'uppercase',
            boxShadow: '0 6px 16px rgba(250,204,21,0.5)',
          }}
        >
          {labels[1]}
        </div>
      </div>

      {/* Bottom headline plate. */}
      <div
        style={{
          position: 'absolute',
          left: '4%',
          right: '4%',
          bottom: '6%',
          padding: `${16 * r.unit}px ${22 * r.unit}px`,
          background:
            'linear-gradient(180deg, rgba(76,29,149,0.85) 0%, rgba(46,16,101,0.92) 100%)',
          borderRadius: 10,
          border: '1px solid rgba(168,85,247,0.4)',
          textAlign: 'center',
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 16}px)`,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: r.safeFont(34),
          fontWeight: 800,
          lineHeight: 1.18,
          color: '#ffffff',
          textShadow: '0 4px 18px rgba(0,0,0,0.6)',
        }}
      >
        {text}
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
