import type { TextMotion } from '@news-tok/shared/schema'

/**
 * Shared animation primitives for Studio previews.
 *
 * The builder dialog (`<BuilderPreviewText>`) and the style picker
 * preview (`<PreviewedTextInline>`) used to maintain their own copies
 * of the keyframes map; the picker copy was actually empty, which is
 * why hovering a style with `enter: 'bounceIn'` rendered the text
 * static. Centralise here so both stay in sync, and so adding a new
 * motion only requires editing one place.
 *
 * The render-side authority is `packages/remotion/src/effects/text/`
 * (frame-driven, Remotion-safe). These keyframes are a lightweight
 * CSS approximation used by the in-browser previews — they don't have
 * to be pixel-perfect, just visually faithful enough that the user
 * can tell motions apart before committing to a render.
 */

/** Map every TextMotion id to a keyframe name (or undefined for "no animation"). */
export const ANIMATION_FOR_MOTION: Record<TextMotion, string | undefined> = {
  none: undefined,
  fade: 'nt-fade',
  slideUp: 'nt-slide-up',
  slideDown: 'nt-slide-down',
  scaleIn: 'nt-scale-in',
  typewriter: 'nt-typewriter',
  wordPop: 'nt-scale-in',
  wordHighlight: 'nt-fade',
  gradientWipe: 'nt-fade',
  slotMachine: 'nt-slide-up',
  blurReveal: 'nt-blur',
  glitch: 'nt-glitch',
  wordReveal3d: 'nt-slide-up',
  waveBounce: 'nt-slide-up',
  maskWipe: 'nt-fade',
  karaoke: 'nt-fade',
  letterStagger: 'nt-fade',
  bounceIn: 'nt-bounce-in',
  rubberBand: 'nt-rubber-band',
  flipInX: 'nt-flip-in-x',
  lightSpeedIn: 'nt-light-speed-in',
  rollIn: 'nt-roll-in',
  tada: 'nt-tada',
  jello: 'nt-jello',
}

export const PREVIEW_KEYFRAMES = `
  @keyframes nt-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes nt-slide-up { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes nt-slide-down { from { opacity: 0; transform: translateY(-20px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes nt-scale-in { from { opacity: 0; transform: scale(0.7) } to { opacity: 1; transform: scale(1) } }
  @keyframes nt-typewriter { from { opacity: 0; clip-path: inset(0 100% 0 0) } to { opacity: 1; clip-path: inset(0 0 0 0) } }
  @keyframes nt-blur { from { opacity: 0; filter: blur(8px) } to { opacity: 1; filter: blur(0) } }
  @keyframes nt-glitch { 0%, 100% { transform: translate(0, 0) } 25% { transform: translate(-1px, 1px) } 75% { transform: translate(1px, -1px) } }
  @keyframes nt-bounce-in {
    0% { opacity: 0; transform: scale(0.3) }
    20% { transform: scale(1.1) }
    40% { transform: scale(0.9) }
    60% { opacity: 1; transform: scale(1.03) }
    80% { transform: scale(0.97) }
    100% { opacity: 1; transform: scale(1) }
  }
  @keyframes nt-rubber-band {
    0% { transform: scale(1,1) }
    30% { transform: scaleX(1.25) scaleY(0.75) }
    40% { transform: scaleX(0.75) scaleY(1.25) }
    50% { transform: scaleX(1.15) scaleY(0.85) }
    65% { transform: scaleX(0.95) scaleY(1.05) }
    75% { transform: scaleX(1.05) scaleY(0.95) }
    100% { transform: scale(1,1) }
  }
  @keyframes nt-flip-in-x {
    0% { opacity: 0; transform: perspective(400px) rotateX(90deg) }
    40% { opacity: 1; transform: perspective(400px) rotateX(-20deg) }
    60% { transform: perspective(400px) rotateX(10deg) }
    80% { transform: perspective(400px) rotateX(-5deg) }
    100% { opacity: 1; transform: perspective(400px) rotateX(0deg) }
  }
  @keyframes nt-light-speed-in {
    0% { opacity: 0; transform: translateX(100%) skewX(-30deg) }
    60% { opacity: 1; transform: translateX(0) skewX(20deg) }
    80% { transform: skewX(-5deg) }
    100% { opacity: 1; transform: translateX(0) skewX(0) }
  }
  @keyframes nt-roll-in {
    0% { opacity: 0; transform: translateX(-100%) rotate(-180deg) }
    40% { opacity: 1 }
    100% { opacity: 1; transform: translateX(0) rotate(0) }
  }
  @keyframes nt-tada {
    0% { transform: scale(1) rotate(0) }
    10%, 20% { transform: scale(0.9) rotate(-3deg) }
    30%, 50%, 70%, 90% { transform: scale(1.1) rotate(3deg) }
    40%, 60%, 80% { transform: scale(1.1) rotate(-3deg) }
    100% { transform: scale(1) rotate(0) }
  }
  @keyframes nt-jello {
    0%, 100% { transform: skewX(0) skewY(0) }
    11% { transform: skewX(-12.5deg) skewY(-12.5deg) }
    22% { transform: skewX(6.25deg) skewY(6.25deg) }
    33% { transform: skewX(-3.125deg) skewY(-3.125deg) }
    44% { transform: skewX(1.56deg) skewY(1.56deg) }
    55% { transform: skewX(-0.78deg) skewY(-0.78deg) }
    66% { transform: skewX(0.39deg) skewY(0.39deg) }
    77% { transform: skewX(-0.2deg) skewY(-0.2deg) }
    88% { transform: skewX(0.1deg) skewY(0.1deg) }
  }
`

/** Bouncy motions need ease-out so the settle is visible. */
const EASE_OUT_MOTIONS: TextMotion[] = ['bounceIn', 'rubberBand', 'tada', 'jello']

/**
 * Compute the inline style props for an animated preview span. Pulls
 * together the animation name, a floored duration (mirrors the render
 * floor in AnimateCssText.tsx), iteration count, easing, and the
 * transform-origin overrides that fix the "rotation pivots in the
 * wrong place" bug for rollIn.
 */
export function previewAnimationStyle(
  enter: TextMotion,
  enterDurationSec: number
): React.CSSProperties {
  const animationName = ANIMATION_FOR_MOTION[enter]
  if (!animationName) return {}
  return {
    animationName,
    // Use the user-set enterDurationSec verbatim + a 1.4s inter-loop
    // pause so the preview reads exactly the speed the final render
    // will produce. Mirrors `AnimateCssText.tsx → animateDurationFrames`
    // which has no floor either.
    animationDuration: `${enterDurationSec + 1.4}s`,
    animationIterationCount: 'infinite',
    animationTimingFunction: (EASE_OUT_MOTIONS as string[]).includes(enter)
      ? 'ease-out'
      : 'ease-in-out',
    // `display: inline-block` so the span has a real box for the
    // transform-origin to anchor against. Bare inline spans collapse
    // to a zero-height baseline and rotate around (0,0).
    display: 'inline-block',
    transformOrigin: enter === 'rollIn' ? 'left center' : 'center center',
  }
}
