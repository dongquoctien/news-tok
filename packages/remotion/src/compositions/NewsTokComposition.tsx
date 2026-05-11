import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion'
import type { Project } from '@news-tok/shared/schema'
import { resolveScene } from '../scenes/registry.js'
import { MissingScene } from '../scenes/MissingScene.js'
import { Subtitles } from '../effects/Subtitles.js'
import { fontFor } from '../scenes/fonts.js'

export type NewsTokCompositionProps = {
  storyboard: Project
}

export const NewsTokComposition = ({ storyboard }: NewsTokCompositionProps) => {
  const { fps } = useVideoConfig()
  const subtitlesEnabled = storyboard.subtitles?.enabled
  const bottomPct = storyboard.subtitles?.bottomPct ?? 0.18
  const subtitleFont = fontFor(storyboard.language)
  let cursor = 0

  const bgMusic = storyboard.bgMusic
  const bgMusicVolume = storyboard.bgMusicVolume ?? 0.2

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {bgMusic ? <Audio src={bgMusic.path} volume={bgMusicVolume} /> : null}
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
