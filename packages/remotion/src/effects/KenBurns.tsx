import {
  AbsoluteFill,
  Img,
  Loop,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import type { BackgroundEdits } from '@news-tok/shared/schema'

export type VideoFitMode = 'cover' | 'contain' | 'fill'

export type VideoAlign =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

/**
 * Map the 9-position align grid to a CSS objectPosition string.
 * Only meaningful when `objectFit === 'contain'`; `cover` and `fill`
 * always occupy the full frame so objectPosition has no visible
 * effect on the rendered output.
 */
const alignToObjectPosition = (align: VideoAlign): string => {
  const [v, h] = align.split('-') as [string, string | undefined]
  // 'center' alone maps both axes; the 8 directional values are
  // {top|center|bottom}-{left|center|right}.
  if (!h) return 'center center'
  return `${h} ${v}`
}

export type KenBurnsProps = {
  src: string
  /**
   * Asset kind. Defaults to `'image'` so every pre-video-support call site
   * renders byte-identically. When `'video'`, the same transform stack
   * (motion + crop + rotate + flip + vignette + overlay) is applied to an
   * `<OffthreadVideo>` instead of `<Img>` — Remotion renders OffthreadVideo
   * as an `<Img>` tag during export, so CSS transforms compose the same way.
   *
   * Accepts `'audio'` for type compatibility with the wider `AssetRef.kind`
   * enum; we treat audio as image (which is nonsensical as a background,
   * but the upstream UI already prevents it — this just keeps TS happy).
   */
  kind?: 'image' | 'video' | 'audio'
  /**
   * Source clip duration (seconds). Used only when `kind === 'video'` to
   * decide how often to loop the trimmed clip across the segment. When
   * absent, the video plays once and freezes on its last frame for the
   * remainder of the segment — usually fine for clips longer than the
   * segment, ugly for shorter ones, so writers should always populate
   * `bg.durationSec` (the upload route does this via ffprobe).
   */
  durationSec?: number
  /**
   * Optional trim window applied to the source video. Mirrors the schema
   * field `segment.videoTrim`. Ignored when `kind !== 'video'`.
   */
  videoTrim?: { startSec: number; endSec?: number }
  /**
   * Whether to loop the trimmed clip across the segment. Defaults to
   * `true` (phase-1 behavior). When `false`, the clip plays once and
   * Remotion freezes on the final frame for the rest of the segment.
   */
  loop?: boolean
  /**
   * Mute the source audio. Default `true`; when `false`, the renderer
   * upstream is also expected to drop `segment.audio.narration` to
   * avoid stacking two voice tracks.
   */
  muted?: boolean
  /** Volume multiplier 0..1 applied when `muted === false`. */
  volume?: number
  /** Playback rate (0.25..2). 1 = normal speed. */
  playbackRate?: number
  /** CSS object-fit equivalent: cover (default) | contain | fill. */
  fit?: VideoFitMode
  /** Nine-position align grid; only meaningful when `fit === 'contain'`. */
  align?: VideoAlign
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
  kind = 'image',
  durationSec,
  videoTrim,
  loop = true,
  muted = true,
  volume = 1,
  playbackRate = 1,
  fit = 'cover',
  align = 'center',
  from = 1.15,
  to = 1.0,
  panX = 0.05,
  panY = -0.05,
  edits,
}: KenBurnsProps) => {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()
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
  // already scales the source along whichever axis would otherwise
  // leave the frame uncovered. The crop only needs an EXTRA scale
  // along the axis that COVER didn't already stretch — i.e. the
  // smaller of (100/widthPct, 100/heightPct). Letting cover finish
  // the work avoids the over-zoom bug where a 9:16 crop on a 16:9
  // source was scaled ~3× because we'd compounded width-only
  // cropScale with cover's height-driven scale.
  //
  // Verified across (source, frame, crop) aspect combinations:
  //   - source 16:9, frame 9:16, crop 9:16 (full-height): 1×
  //   - source 9:16, frame 9:16, crop half size: 2×
  //   - source 16:9, frame 9:16, crop half-height 9:16: 2×
  // In every case, min(100/w, 100/h) gives the residual scale that
  // cover hasn't already applied, and the cropped region lands
  // exactly inside the frame.
  let cropScale = 1
  let cropObjectPosition: string | undefined
  if (edits?.crop) {
    const c = edits.crop
    const w = Math.max(c.widthPct, 1)
    const h = Math.max(c.heightPct, 1)
    cropScale = Math.min(100 / w, 100 / h)
    // objectPosition takes 0..100% — convert the crop's center to %.
    const cx = c.xPct + c.widthPct / 2
    const cy = c.yPct + c.heightPct / 2
    cropObjectPosition = `${cx}% ${cy}%`
  }

  const overlay = edits?.overlay
  const vignette = edits?.vignette ?? 0

  // Pick objectPosition source. When the user has set an explicit
  // BackgroundEdits.crop, that crop's center wins — moving the
  // crop window IS the user's positioning intent. Otherwise fall
  // back to the segment's videoAlign mapping (only visible when
  // fit !== 'cover').
  const objectPosition =
    cropObjectPosition ?? (kind === 'video' ? alignToObjectPosition(align) : undefined)

  // For images we keep the historical 'cover' fit so the existing
  // crop/zoom math behaves identically. The `fit` prop only takes
  // effect when rendering a video — that's the only place the user
  // has a UI control for it today.
  const effectiveFit: VideoFitMode = kind === 'video' ? fit : 'cover'

  const mediaStyle = {
    width: '100%',
    height: '100%',
    objectFit: effectiveFit,
    objectPosition,
    transform: `${transform} scale(${cropScale})`,
    transformOrigin: 'center center',
  } as const

  // Video branch — wrap OffthreadVideo in <Loop> so a 4s clip in an
  // 8s segment plays through twice instead of freezing at frame 120.
  // We compute the clip length in frames from (videoTrim, durationSec):
  //
  //   trimmed = (endSec ?? durationSec) - startSec
  //   loopFrames = max(1, round(trimmed * fps))
  //
  // When `loop === false`, we skip the wrapper entirely so Remotion
  // freezes on the last frame after the trimmed clip ends. When
  // `durationSec` is missing we cannot loop safely either way, so
  // the same fallback applies.
  const renderMedia = () => {
    if (kind === 'video') {
      const startSec = Math.max(0, videoTrim?.startSec ?? 0)
      const endSec = videoTrim?.endSec ?? durationSec
      const trimBeforeFrames = Math.max(0, Math.round(startSec * fps))
      const video = (
        <OffthreadVideo
          src={src}
          muted={muted}
          volume={muted ? 0 : Math.max(0, Math.min(1, volume))}
          playbackRate={playbackRate}
          trimBefore={trimBeforeFrames || undefined}
          style={mediaStyle}
        />
      )
      const canLoop =
        loop &&
        typeof endSec === 'number' &&
        endSec > startSec &&
        Number.isFinite(endSec)
      if (canLoop) {
        const trimmedSec = (endSec as number) - startSec
        const loopFrames = Math.max(1, Math.round(trimmedSec * fps))
        return <Loop durationInFrames={loopFrames}>{video}</Loop>
      }
      return video
    }
    return <Img src={src} style={mediaStyle} />
  }

  // When fit !== 'cover', the rendered media leaves bars around it.
  // Paint a flat black backdrop so the bars aren't transparent over
  // whatever the scene's underlying AbsoluteFill happens to be.
  const needsLetterboxBackdrop = kind === 'video' && fit !== 'cover'

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: needsLetterboxBackdrop ? '#000' : undefined }}>
      {renderMedia()}
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
