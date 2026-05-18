import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { typographyStyle, type TextPrimitiveProps } from './types.js'
import { useResponsive } from '../../scenes/sizing.js'
import { HighlightedRun } from './highlight-run.js'

/** Render `parts` with highlight when both are present; otherwise plain `text`. */
function renderBody(props: TextPrimitiveProps): React.ReactNode {
  if (props.parts && props.highlightStyle) {
    return <HighlightedRun runs={props.parts} highlight={props.highlightStyle} />
  }
  return props.text
}

/**
 * Frame-driven ports of seven animate.css entrance / attention seekers.
 * The originals are CSS-keyframe driven and rely on a single animation
 * play head; Remotion's render is seek-anywhere, so we recompute the
 * transform on every frame from `useCurrentFrame`. The visual silhouette
 * matches animate.css; the durations are read from `enterDurationSec` so
 * the user controls timing the same way as for every other primitive.
 */
function animateDurationFrames(props: TextPrimitiveProps, fps: number): number {
  return Math.max(1, props.style.enterDurationSec * fps)
}

function wrapStyle(
  props: TextPrimitiveProps,
  fontPx: number,
  transform: string,
  opacity: number,
  origin = 'center center'
) {
  return {
    ...typographyStyle(props.style, fontPx, props.fontOverride, props.colorOverride),
    opacity,
    transform,
    transformOrigin: origin,
    willChange: 'transform, opacity',
  } as React.CSSProperties
}

/** bounceIn — three-step drop + bounce, settling at scale 1. */
export const BounceInText = (props: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const durFrames = animateDurationFrames(props, fps)
  // animate.css bounceIn: opacity 0→1 at 0%/60%, scale 0.3→1.05→0.9→1.03→0.97→1.
  const t = Math.min(1, frame / durFrames)
  const scale = interpolate(
    t,
    [0, 0.2, 0.4, 0.6, 0.8, 1],
    [0.3, 1.1, 0.9, 1.03, 0.97, 1],
    { extrapolateRight: 'clamp' }
  )
  const opacity = interpolate(t, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={wrapStyle(props, props.style.fontSize * r.font, `scale(${scale})`, opacity)}>
      {renderBody(props)}
    </div>
  )
}

/** rubberBand — squish-and-stretch attention seeker, no opacity change. */
export const RubberBandText = (props: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const dur = animateDurationFrames(props, fps)
  const t = Math.min(1, frame / dur)
  // 0% scale(1,1); 30% scaleX(1.25, 0.75); 40% scaleX(0.75, 1.25);
  // 50% scaleX(1.15, 0.85); 65% scaleX(0.95, 1.05); 75% scaleX(1.05, 0.95);
  // 100% scale(1,1).
  const sx = interpolate(
    t,
    [0, 0.3, 0.4, 0.5, 0.65, 0.75, 1],
    [1, 1.25, 0.75, 1.15, 0.95, 1.05, 1],
    { extrapolateRight: 'clamp' }
  )
  const sy = interpolate(
    t,
    [0, 0.3, 0.4, 0.5, 0.65, 0.75, 1],
    [1, 0.75, 1.25, 0.85, 1.05, 0.95, 1],
    { extrapolateRight: 'clamp' }
  )
  return (
    <div style={wrapStyle(props, props.style.fontSize * r.font, `scaleX(${sx}) scaleY(${sy})`, 1)}>
      {renderBody(props)}
    </div>
  )
}

/** flipInX — 3D flip on the X axis with opacity fade in. */
export const FlipInXText = (props: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const dur = animateDurationFrames(props, fps)
  const t = Math.min(1, frame / dur)
  const rot = interpolate(t, [0, 0.4, 0.6, 0.8, 1], [90, -20, 10, -5, 0], {
    extrapolateRight: 'clamp',
  })
  const opacity = interpolate(t, [0, 0.4, 1], [0, 1, 1], { extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        perspective: 400,
        // typographyStyle owns colour + font; we keep the
        // perspective on the wrapper so the rotation feels 3D.
      }}
    >
      <div
        style={wrapStyle(
          props,
          props.style.fontSize * r.font,
          `rotateX(${rot}deg)`,
          opacity,
          'center'
        )}
      >
        {renderBody(props)}
      </div>
    </div>
  )
}

/** lightSpeedIn — slide in from the right with a forward skew, settling flat. */
export const LightSpeedInText = (props: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const dur = animateDurationFrames(props, fps)
  const t = Math.min(1, frame / dur)
  const tx = interpolate(t, [0, 0.6, 1], [100, 0, 0], { extrapolateRight: 'clamp' })
  const skew = interpolate(t, [0, 0.6, 0.8, 1], [-30, 20, -5, 0], { extrapolateRight: 'clamp' })
  const opacity = interpolate(t, [0, 0.6, 1], [0, 1, 1], { extrapolateRight: 'clamp' })
  return (
    <div
      style={wrapStyle(
        props,
        props.style.fontSize * r.font,
        `translateX(${tx}%) skewX(${skew}deg)`,
        opacity
      )}
    >
      {renderBody(props)}
    </div>
  )
}

/** rollIn — slide in from the left while rotating. Animate.css spec:
 *  translate3d(-100%, 0, 0) + rotate(-120deg) → settle at (0, 0deg).
 *  We bump to -180deg so the rotation reads as a full half-turn the
 *  way users expect from a "roll" — strictly closer to animate.css's
 *  `lightSpeedInRight` energy, but reviewers consistently report the
 *  120deg version looks too subtle in 9:16 narrow frames. */
export const RollInText = (props: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const dur = animateDurationFrames(props, fps)
  const t = Math.min(1, frame / dur)
  const tx = interpolate(t, [0, 1], [-100, 0], { extrapolateRight: 'clamp' })
  const rot = interpolate(t, [0, 1], [-180, 0], { extrapolateRight: 'clamp' })
  const opacity = interpolate(t, [0, 0.4, 1], [0, 1, 1], { extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        ...wrapStyle(
          props,
          props.style.fontSize * r.font,
          `translateX(${tx}%) rotate(${rot}deg)`,
          opacity
        ),
        // Roll feels more "roll" when the pivot is the leading edge.
        transformOrigin: 'left center',
      }}
    >
      {renderBody(props)}
    </div>
  )
}

/** tada — small grow + rotate left/right shake, no translate. */
export const TadaText = (props: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const dur = animateDurationFrames(props, fps)
  const t = Math.min(1, frame / dur)
  const scale = interpolate(t, [0, 0.1, 0.2, 1], [1, 0.9, 1.1, 1], { extrapolateRight: 'clamp' })
  // Wobble: -3°/+3° alternating between 20% and 90% of the duration.
  const stepIdx = Math.floor(((t - 0.2) / 0.7) * 8)
  const rot =
    t < 0.2 || t > 0.9 ? 0 : stepIdx % 2 === 0 ? -3 : 3
  // Spring softens the settle so the last frame doesn't snap.
  const settle = spring({ frame, fps, config: { damping: 14, mass: 0.4, stiffness: 200 } })
  const opacity = Math.min(1, settle * 1.2)
  return (
    <div
      style={wrapStyle(
        props,
        props.style.fontSize * r.font,
        `scale(${scale}) rotate(${rot}deg)`,
        opacity
      )}
    >
      {renderBody(props)}
    </div>
  )
}

/** jello — horizontal skew wobble settling at 0. */
export const JelloText = (props: TextPrimitiveProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const r = useResponsive()
  const dur = animateDurationFrames(props, fps)
  const t = Math.min(1, frame / dur)
  const skewX = interpolate(
    t,
    [0, 0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 1],
    [0, -12.5, 6.25, -3.125, 1.5625, -0.78125, 0.39, -0.2, 0.1, 0],
    { extrapolateRight: 'clamp' }
  )
  const skewY = skewX // animate.css applies them as a single matrix; same magnitude reads close.
  const opacity = interpolate(t, [0, 0.2, 1], [0, 1, 1], { extrapolateRight: 'clamp' })
  return (
    <div
      style={wrapStyle(
        props,
        props.style.fontSize * r.font,
        `skewX(${skewX}deg) skewY(${skewY}deg)`,
        opacity
      )}
    >
      {renderBody(props)}
    </div>
  )
}
