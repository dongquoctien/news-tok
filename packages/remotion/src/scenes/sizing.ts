import { useVideoConfig } from 'remotion'

/**
 * Returns scale factors so scenes look consistent across aspect ratios.
 * Base reference is the 9:16 portrait composition (1080 × 1920).
 *
 * - `unit` scales linearly with min(width, height) — use for paddings.
 * - `font` scales with height so type stays readable in both portrait and
 *   landscape compositions.
 */
export function useResponsive() {
  const { width, height } = useVideoConfig()
  const BASE_MIN = 1080
  const BASE_HEIGHT = 1920
  return {
    width,
    height,
    aspect: width / height,
    unit: Math.min(width, height) / BASE_MIN,
    font: height / BASE_HEIGHT,
    /** True for 16:9 (landscape), false for 9:16 / 1:1. */
    landscape: width > height,
  }
}
