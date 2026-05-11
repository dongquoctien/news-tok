import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { Project } from '@news-tok/shared/schema'
import { resolveScene } from '../scenes/registry.js'
import { MissingScene } from '../scenes/MissingScene.js'
import { Subtitles } from '../effects/Subtitles.js'
import { fontFor } from '../scenes/fonts.js'

export type NewsTokCompositionProps = {
  storyboard: Project
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
  // Loop if the track is shorter than the video.
  const shouldLoop = trackDurationSec != null && trackDurationSec < videoDurationSec
  return <Audio src={src} volume={volume * fade} loop={shouldLoop} />
}

export const NewsTokComposition = ({ storyboard }: NewsTokCompositionProps) => {
  const { fps } = useVideoConfig()
  const subtitlesEnabled = storyboard.subtitles?.enabled
  const bottomPct = storyboard.subtitles?.bottomPct ?? 0.18
  const subtitleFont = fontFor(storyboard.language)
  let cursor = 0

  const bgMusic = storyboard.bgMusic
  const bgMusicVolume = storyboard.bgMusicVolume ?? 0.2
  const videoDurationSec = storyboard.segments.reduce((s, x) => s + x.durationSec, 0)

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
        const hasSubs = subtitlesEnabled && segment.wordBoundaries && segment.wordBoundaries.length > 0
        return (
          <Sequence key={segment.id} from={from} durationInFrames={durationInFrames} name={segment.id}>
            {Scene ? (
              <Scene segment={segment} project={storyboard} />
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
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
