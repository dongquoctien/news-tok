import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { BackgroundEdits } from '@news-tok/shared/schema'

export type KenBurnsProps = {
  src: string
  /** Start scale; usually >= end so we zoom out. */
  from?: number
  /** End scale. */
  to?: number
  /** Direction of pan, in normalized [-1..1]. */
  panX?: number
  panY?: number
  /**
   * Optional non-destructive image edits. When present, they compose
   * with the Ken Burns motion: the crop runs first (via objectPosition
   * + scale on the image so cropped pixels actually fill the frame),
   * then rotation/flip ride along with the Ken Burns scale, and the
   * overlay + vignette are painted as siblings on top of the image.
   *
   * Defaults that match an absent `edits` value: no crop, 0 rotation,
   * no flip, no vignette, no overlay — i.e. identity, so existing
   * scenes render byte-identically when the user hasn't touched edits.
   */
  edits?: BackgroundEdits
}

export const KenBurns = ({
  src,
  from = 1.15,
  to = 1.0,
  panX = 0.05,
  panY = -0.05,
  edits,
}: KenBurnsProps) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const motionScale = from + (to - from) * t
  const translateX = panX * 100 * t
  const translateY = panY * 100 * t

  // Compose user-edit transforms with the motion transforms. Order
  // matters: rotate first (so the image spins about its own center),
  // then flip, then the Ken Burns scale + translate. This mirrors how
  // image editors stack the same operations on the layer.
  const userTransforms: string[] = []
  if (edits?.rotateDeg) userTransforms.push(`rotate(${edits.rotateDeg}deg)`)
  if (edits?.flipH) userTransforms.push('scaleX(-1)')
  if (edits?.flipV) userTransforms.push('scaleY(-1)')
  const transform = [
    ...userTransforms,
    `scale(${motionScale})`,
    `translate(${translateX}px, ${translateY}px)`,
  ].join(' ')

  // Map a user crop rect (% of source image) to objectPosition + an
  // additional scale so the crop fills the frame. objectFit:cover
  // already centers + scales — we shift the focal point with
  // objectPosition and scale up by 100/cropWidthPct so the cropped
  // region exactly fills the AbsoluteFill.
  let cropScale = 1
  let objectPosition: string | undefined
  if (edits?.crop) {
    const c = edits.crop
    cropScale = 100 / Math.max(c.widthPct, 1)
    // objectPosition takes 0..100% — convert the crop's center to %.
    const cx = c.xPct + c.widthPct / 2
    const cy = c.yPct + c.heightPct / 2
    objectPosition = `${cx}% ${cy}%`
  }

  const overlay = edits?.overlay
  const vignette = edits?.vignette ?? 0

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition,
          transform: `${transform} scale(${cropScale})`,
          transformOrigin: 'center center',
        }}
      />
      {/* Solid-color overlay layer. Sits between the image and the
          scene's existing gradient overlays. Blend mode lets users
          push 'multiply' for darker punch or 'soft-light' for a
          colorized wash. */}
      {overlay && overlay.opacity > 0 ? (
        <AbsoluteFill
          style={{
            background: overlay.color,
            opacity: overlay.opacity,
            mixBlendMode: overlay.blendMode ?? 'normal',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {/* Radial vignette — pure black at the corners that fades to
          transparent at the center. Drawn in CSS so it stays sharp
          at any output resolution. */}
      {vignette > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,${vignette}) 100%)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </AbsoluteFill>
  )
}
