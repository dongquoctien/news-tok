import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { Project, SceneKind, Segment, TextStyle, Variant } from '@news-tok/shared/schema'
import { BUILT_IN_TEXT_STYLES, findTextStyle, DEFAULT_TEXT_STYLE_ID } from '@news-tok/shared/text-styles'
import { resolveScene } from '../scenes/registry.js'
import { MissingScene } from '../scenes/MissingScene.js'
import { Subtitles } from '../effects/Subtitles.js'
import { fontFor } from '../scenes/fonts.js'

export type NewsTokCompositionProps = {
  storyboard: Project
  /** Id of the variant to render. Falls back to the first variant, or none. */
  variantId?: string
  /**
   * Map of sfx id → URL the renderer has rewritten to live under publicDir
   * (`/public/sfx/<id>.mp3`). Keys missing from the map are silently
   * dropped — they are treated as silence.
   */
  sfxUrlMap?: Record<string, string>
}

/**
 * Background music that adapts to the project duration:
 *  - if the track is shorter than the video, loop it (Remotion <Audio loop>).
 *  - either way, fade the last ~1.2s so the video tail does not cut off
 *    mid-bar. When the track is longer than the video the fade also
 *    masks the natural mid-song stop.
 */
function BgMusic({
  src,
  volume,
  trackDurationSec,
  videoDurationSec,
}: {
  src: string
  volume: number
  trackDurationSec: number | undefined
  videoDurationSec: number
}) {
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const totalFrames = Math.max(1, Math.round(videoDurationSec * fps))
  const fadeFrames = Math.min(Math.round(1.2 * fps), Math.floor(totalFrames / 3))
  const fadeStart = Math.max(0, totalFrames - fadeFrames)
  const fade = interpolate(frame, [fadeStart, totalFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const shouldLoop = trackDurationSec != null && trackDurationSec < videoDurationSec
  return <Audio src={src} volume={volume * fade} loop={shouldLoop} />
}

const FALLBACK_STYLE: TextStyle =
  findTextStyle(DEFAULT_TEXT_STYLE_ID, []) ?? BUILT_IN_TEXT_STYLES[0]!

/**
 * Resolve which text style applies to a segment under the active variant.
 * Priority (most specific wins):
 *   1. variant.textStyleBySegmentId[segment.id] — per-variant per-segment override
 *   2. segment.textStyleId — project-wide segment override
 *   3. variant.textStyleBySceneKind[scene] — variant default for this scene kind
 *   4. DEFAULT_TEXT_STYLE_ID
 */
function resolveStyle(
  segment: Segment,
  variant: Variant | undefined,
  userStyles: TextStyle[]
): TextStyle {
  if (variant) {
    const perSegmentId = variant.textStyleBySegmentId?.[segment.id]
    const perSegment = findTextStyle(perSegmentId, userStyles)
    if (perSegment) return perSegment
  }
  const direct = findTextStyle(segment.textStyleId, userStyles)
  if (direct) return direct
  if (variant) {
    const sceneKey = (segment.scene as SceneKind) as string
    const styleId = variant.textStyleBySceneKind[sceneKey]
    const fromVariant = findTextStyle(styleId, userStyles)
    if (fromVariant) return fromVariant
  }
  return FALLBACK_STYLE
}

/** Emit short SFX cues for a single segment based on its text style. */
function SegmentSfx({
  segment,
  style,
  sfxUrlMap,
  masterVolume,
}: {
  segment: Segment
  style: TextStyle
  sfxUrlMap: Record<string, string>
  masterVolume: number
}) {
  const { fps } = useVideoConfig()
  const sfx = style.sfx
  if (!sfx) return null
  const cues: React.ReactNode[] = []
  const enterUrl = sfx.enterSoundId ? sfxUrlMap[sfx.enterSoundId] : undefined
  if (enterUrl) {
    cues.push(
      <Audio
        key="enter"
        src={enterUrl}
        volume={(sfx.enterVolume ?? 0.6) * masterVolume}
      />
    )
  }
  const perWordUrl = sfx.perWordSoundId ? sfxUrlMap[sfx.perWordSoundId] : undefined
  if (perWordUrl && segment.wordBoundaries && segment.wordBoundaries.length > 0) {
    segment.wordBoundaries.forEach((w, i) => {
      const from = Math.round(w.offsetSec * fps)
      const dur = Math.max(1, Math.round(w.durationSec * fps))
      cues.push(
        <Sequence key={`w-${i}`} from={from} durationInFrames={dur} layout="none">
          <Audio
            src={perWordUrl}
            volume={(sfx.perWordVolume ?? 0.4) * masterVolume}
          />
        </Sequence>
      )
    })
  }
  return <>{cues}</>
}

export const NewsTokComposition = ({
  storyboard,
  variantId,
  sfxUrlMap = {},
}: NewsTokCompositionProps) => {
  const { fps } = useVideoConfig()
  const subtitlesEnabled = storyboard.subtitles?.enabled
  const bottomPct = storyboard.subtitles?.bottomPct ?? 0.18
  const subtitleFont = fontFor(storyboard.language)
  let cursor = 0

  const bgMusic = storyboard.bgMusic
  const bgMusicVolume = storyboard.bgMusicVolume ?? 0.2
  const masterSfxVolume = storyboard.sfxVolume ?? 0.7
  const videoDurationSec = storyboard.segments.reduce((s, x) => s + x.durationSec, 0)
  const userStyles = storyboard.userTextStyles ?? []
  const variants = storyboard.variants ?? []
  const activeVariant =
    variants.find((v) => v.id === variantId) ?? variants[0] ?? undefined

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {bgMusic ? (
        <BgMusic
          src={bgMusic.path}
          volume={bgMusicVolume}
          trackDurationSec={bgMusic.durationSec}
          videoDurationSec={videoDurationSec}
        />
      ) : null}
      {storyboard.segments.map((segment) => {
        const durationInFrames = Math.max(1, Math.round(segment.durationSec * fps))
        const Scene = resolveScene(segment.scene)
        const from = cursor
        cursor += durationInFrames
        const hasSubs =
          subtitlesEnabled && segment.wordBoundaries && segment.wordBoundaries.length > 0
        const style = resolveStyle(segment, activeVariant, userStyles)
        return (
          <Sequence key={segment.id} from={from} durationInFrames={durationInFrames} name={segment.id}>
            {Scene ? (
              <Scene segment={segment} project={storyboard} textStyle={style} />
            ) : (
              <MissingScene segment={segment} project={storyboard} />
            )}
            {hasSubs ? (
              <Subtitles
                wordBoundaries={segment.wordBoundaries!}
                bottomPct={bottomPct}
                fontFamily={subtitleFont}
              />
            ) : null}
            <SegmentSfx
              segment={segment}
              style={style}
              sfxUrlMap={sfxUrlMap}
              masterVolume={masterSfxVolume}
            />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
