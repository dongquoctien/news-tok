import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

/**
 * Returns a 0..1 progress value over [start, end] frames with optional easing.
 */
export function useProgress(start: number, end: number) {
  const frame = useCurrentFrame()
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

/**
 * Spring-based 0..1 entrance progress driven by the current frame.
 */
export function useEntranceSpring(opts: { delayFrames?: number; damping?: number } = {}) {
  const { delayFrames = 0, damping = 12 } = opts
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    config: { damping },
  })
}
