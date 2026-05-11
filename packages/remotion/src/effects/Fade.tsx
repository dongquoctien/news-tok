import type { ReactNode } from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

export type FadeProps = {
  children: ReactNode
  /** Fade-in duration in seconds. */
  inSec?: number
  /** Fade-out duration in seconds. */
  outSec?: number
  /** Override the segment duration (in seconds). Defaults to the parent Sequence's duration. */
  totalSec?: number
}

export const Fade = ({ children, inSec = 0.3, outSec = 0.3, totalSec }: FadeProps) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const total = totalSec != null ? Math.round(totalSec * fps) : durationInFrames
  const inFrames = Math.round(inSec * fps)
  const outFrames = Math.round(outSec * fps)
  const opacity = interpolate(
    frame,
    [0, inFrames, Math.max(inFrames, total - outFrames), total],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )
  return <div style={{ opacity, width: '100%', height: '100%' }}>{children}</div>
}
