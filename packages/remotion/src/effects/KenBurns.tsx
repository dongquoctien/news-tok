import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

export type KenBurnsProps = {
  src: string
  /** Start scale; usually >= end so we zoom out. */
  from?: number
  /** End scale. */
  to?: number
  /** Direction of pan, in normalized [-1..1]. */
  panX?: number
  panY?: number
}

export const KenBurns = ({
  src,
  from = 1.15,
  to = 1.0,
  panX = 0.05,
  panY = -0.05,
}: KenBurnsProps) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = from + (to - from) * t
  const translateX = panX * 100 * t
  const translateY = panY * 100 * t
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: 'center center',
        }}
      />
    </AbsoluteFill>
  )
}
