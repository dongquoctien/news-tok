import { useVideoConfig } from 'remotion'

/**
 * Aspect class for the active composition. Computed from width/height
 * with a small tolerance — anything within ±5% of 1.0 counts as square,
 * so an off-by-one preset (e.g. 1080x1086) still resolves correctly.
 */
export type AspectKind = 'portrait' | 'landscape' | 'square'

const PORTRAIT_HEIGHT = 1920
const SQUARE_SIDE = 1080
const LANDSCAPE_HEIGHT = 1080
const SQUARE_TOLERANCE = 0.05

export function classifyAspect(width: number, height: number): AspectKind {
  const ratio = width / height
  if (Math.abs(ratio - 1) <= SQUARE_TOLERANCE) return 'square'
  return ratio < 1 ? 'portrait' : 'landscape'
}

/**
 * Pure scale calculator shared by `useResponsive` and unit tests. Splits
 * the React-bound hook from the math so tests don't need to mock
 * `useVideoConfig` to validate scaling behaviour.
 */
export function computeResponsive(width: number, height: number) {
  const kind = classifyAspect(width, height)
  const BASE_MIN = 1080
  let fontScale: number
  switch (kind) {
    case 'portrait':
      fontScale = height / PORTRAIT_HEIGHT
      break
    case 'landscape':
      fontScale = height / LANDSCAPE_HEIGHT
      break
    case 'square':
      fontScale = Math.min(width, height) / SQUARE_SIDE
      break
  }
  const unit = Math.min(width, height) / BASE_MIN
  const safeFont = (base: number): number => {
    if (kind === 'portrait') return base * fontScale
    const clamped = Math.min(1.1, Math.max(0.78, fontScale))
    return base * clamped
  }
  return { kind, unit, font: fontScale, safeFont }
}

/**
 * Returns scale factors so scenes look consistent across aspect ratios.
 * Base reference is the 9:16 portrait composition (1080 × 1920).
 *
 * - `unit` scales linearly with min(width, height) — use for paddings.
 * - `font` scales with the canvas's intrinsic axis (portrait: height /
 *   1920, landscape: height / 1080, square: side / 1080). Without this
 *   per-aspect branching, 1:1 type collapses to ~56% because
 *   `height / 1920` is 0.5625 at 1080×1080.
 * - `safeFont(base)` clamps a logical-px font size to a legible scale
 *   across portrait / square / landscape, giving layouts a single
 *   knob that survives an unaudited aspect change.
 */
export function useResponsive() {
  const { width, height } = useVideoConfig()
  const r = computeResponsive(width, height)
  return {
    width,
    height,
    aspect: width / height,
    kind: r.kind,
    unit: r.unit,
    font: r.font,
    /** True for 16:9 (landscape), false for 9:16 / 1:1. */
    landscape: r.kind === 'landscape',
    /** True for 1:1 — convenient guard for layouts that need to drop a band. */
    square: r.kind === 'square',
    /**
     * Clamp a logical-px font size to a legible scale across aspects.
     * - Portrait: returns `base * font` (no change from raw `r.font`).
     * - Square / landscape: returns `base * clamp(font, 0.78, 1.1)`, so
     *   headlines don't shrink to ~56% at 1:1 and don't blow out at 16:9.
     */
    safeFont: r.safeFont,
  }
}
