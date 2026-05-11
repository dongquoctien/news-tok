import type { CSSProperties } from 'react'
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion'

export type TypewriterProps = {
  text: string
  /** Characters per second. */
  cps?: number
  /** Optional delay (seconds) before typing starts. */
  delaySec?: number
  style?: CSSProperties
}

export const Typewriter = ({ text, cps = 28, delaySec = 0, style }: TypewriterProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const startFrame = Math.round(delaySec * fps)
  const totalChars = text.length
  const framesToFull = Math.max(1, Math.round((totalChars / cps) * fps))
  const visibleChars = Math.max(
    0,
    Math.min(
      totalChars,
      Math.round(
        interpolate(frame, [startFrame, startFrame + framesToFull], [0, totalChars], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      )
    )
  )
  const visible = text.slice(0, visibleChars)
  const showCaret = visibleChars < totalChars
  return (
    <span style={style}>
      {visible}
      {showCaret ? <span style={{ opacity: (frame % fps) < fps / 2 ? 1 : 0 }}>|</span> : null}
    </span>
  )
}
