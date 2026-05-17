import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Users } from 'lucide-react'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * OutroFollowChannel — YouTube/VTV-style channel card outro.
 *
 * Vertical composition:
 *   - Logo at the top in a circular dark plate.
 *   - Channel name (project.title or override) below the logo.
 *   - Handle (`@newstokvn` from eyebrow) below the name.
 *   - Animated follower counter that ticks up to its target.
 *   - Yellow "FOLLOW" button at the bottom that scales in.
 *
 * Slot mapping:
 *   - text — channel name. Defaults to "NEWS TOK VN".
 *   - eyebrow — handle (default "@newstokvn").
 *   - fileId — target follower count to animate to (e.g. "1.2M",
 *     "247K", "1024"). Defaults to "1.2M" so the layout looks
 *     populated even without explicit configuration.
 *   - chips — not used.
 *
 * No media slot — outros are brand-led. KenBurns photo here would
 * fight the logo and counter for attention.
 */
export function OutroFollowChannel({
  text,
  eyebrow,
  fileId,
  segment,
  brandLogoUrl,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const narration = segment.audio?.narration

  // Logo / name / handle stagger in on a single spring.
  const stack = spring({ frame, fps, config: { damping: 13 } })

  // Counter ticks from 0 → target over 60 frames, with a slight
  // overshoot easing so it lands hard. The target is parsed from
  // `fileId`; if parse fails, default to 1.2M.
  const { value: targetValue, suffix } = parseFollowerCount(fileId || '1.2M')
  const countProgress = interpolate(frame, [12, 72], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    // ease-out for the counter — slow at the end so the final
    // number feels arrived-at rather than slammed.
    easing: (t: number) => 1 - Math.pow(1 - t, 3),
  })
  const displayValue = Math.round(targetValue * countProgress)

  // Button enters last and pulses subtly so the eye returns to it.
  const buttonIn = spring({ frame: Math.max(0, frame - 50), fps, config: { damping: 11 } })
  const buttonPulse = interpolate(
    Math.sin((frame / 36) * Math.PI * 2),
    [-1, 1],
    [0.96, 1.04]
  )

  const channelName = text || 'NEWS TOK VN'
  const handle = eyebrow || '@newstokvn'

  return (
    <AbsoluteFill
      style={{
        // Editorial dark blue → near-black — reads as broadcast,
        // not advertorial. Same palette family as StoryVtv.
        background:
          'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0b0b0f 100%)',
      }}
    >
      {/* Soft top vignette glow — focuses attention on the logo. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(168,85,247,0.18) 0%, transparent 55%)',
        }}
      />

      {/* Logo plate — dark circular frame so the white-bg logo PNG
          doesn't read as a white square dropped on the gradient. */}
      <div
        style={{
          position: 'absolute',
          top: 280 * r.unit,
          left: '50%',
          transform: `translateX(-50%) translateY(${(1 - stack) * 30}px) scale(${0.85 + stack * 0.15})`,
          opacity: stack,
          width: 360 * r.unit,
          height: 360 * r.unit,
          borderRadius: '50%',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow:
            '0 24px 60px rgba(0,0,0,0.6), 0 0 0 6px rgba(168,85,247,0.4)',
          overflow: 'hidden',
        }}
      >
        <Img
          src={brandLogoUrl || '/public/newstokvn-logo.png'}
          style={{ width: '88%', height: '88%', objectFit: 'contain' }}
        />
      </div>

      {/* Channel name — big, centered, bold. */}
      <div
        style={{
          position: 'absolute',
          top: 700 * r.unit,
          left: 56 * r.unit,
          right: 56 * r.unit,
          textAlign: 'center',
          transform: `translateY(${(1 - stack) * 30}px)`,
          opacity: stack,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 72 * r.font,
          fontWeight: 900,
          color: '#ffffff',
          letterSpacing: 1,
          textShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        {channelName.toUpperCase()}
      </div>

      {/* Handle, smaller, slightly faded. */}
      <div
        style={{
          position: 'absolute',
          top: 800 * r.unit,
          left: 0,
          right: 0,
          textAlign: 'center',
          transform: `translateY(${(1 - stack) * 30}px)`,
          opacity: stack * 0.85,
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 36 * r.font,
          fontWeight: 600,
          color: '#cbd5f5',
          letterSpacing: 0.5,
        }}
      >
        {handle}
      </div>

      {/* Animated follower counter — Users icon + ticking number. */}
      <div
        style={{
          position: 'absolute',
          top: 920 * r.unit,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 18 * r.unit,
          padding: `${16 * r.unit}px ${30 * r.unit}px`,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 18,
          opacity: stack,
        }}
      >
        <Users size={42 * r.unit} strokeWidth={2.4} color="#a855f7" />
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 56 * r.font,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: 2,
          }}
        >
          {formatCount(displayValue)}{suffix}
        </span>
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 28 * r.font,
            fontWeight: 600,
            color: '#a5b4fc',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Người theo dõi
        </span>
      </div>

      {/* "FOLLOW" yellow CTA button — bottom of frame, subtle pulse. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 240 * r.unit,
          transform: `translateX(-50%) scale(${(0.7 + buttonIn * 0.3) * buttonPulse})`,
          opacity: buttonIn,
          padding: `${24 * r.unit}px ${72 * r.unit}px`,
          background: 'linear-gradient(180deg, #facc15 0%, #ca8a04 100%)',
          color: '#0b0b0f',
          fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
          fontSize: 42 * r.font,
          fontWeight: 900,
          letterSpacing: 4,
          textTransform: 'uppercase',
          borderRadius: 12,
          boxShadow:
            '0 14px 36px rgba(250,204,21,0.5), 0 0 0 4px rgba(250,204,21,0.18)',
          whiteSpace: 'nowrap',
        }}
      >
        Theo dõi kênh
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}

/**
 * Parse a follower-count string like "1.2M", "247K", or "1024" into
 * the numeric value to count up to plus the K/M suffix to print at
 * the end. Invalid input falls back to (1200, 'K') so the counter
 * always animates to something believable.
 */
function parseFollowerCount(input: string): { value: number; suffix: string } {
  const m = input.match(/^([\d.]+)\s*([KMkm]?)$/)
  if (!m) return { value: 1200, suffix: 'K' }
  const num = parseFloat(m[1]!)
  const suffixRaw = (m[2] ?? '').toUpperCase()
  if (!isFinite(num)) return { value: 1200, suffix: 'K' }
  // Animate over the actual displayed number, not the underlying
  // count — "1.2M" ticks to 1.2 on screen, then we append "M".
  return { value: num, suffix: suffixRaw }
}

/** Render the count with one decimal for sub-10 values, no
 *  decimals for everything else. Mirrors how social platforms
 *  show small vs. large counter values. */
function formatCount(n: number): string {
  if (n < 10) return n.toFixed(1)
  return Math.round(n).toString()
}
