'use client'

import { Player } from '@remotion/player'
import { ASPECT_PRESETS, type Project } from '@news-tok/shared/schema'
import { NewsTokComposition } from '@news-tok/remotion/compositions/NewsTokComposition'

export function PlayerPane({ project }: { project: Project }) {
  const preset = ASPECT_PRESETS[project.aspect]
  const totalSec = project.segments.reduce((sum, s) => sum + s.durationSec, 0)
  const durationInFrames = Math.max(1, Math.round(totalSec * preset.fps))

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/40">
      <div className="w-full max-w-[420px]">
        <Player
          component={NewsTokComposition}
          inputProps={{ storyboard: project }}
          durationInFrames={durationInFrames}
          fps={preset.fps}
          compositionWidth={preset.width}
          compositionHeight={preset.height}
          controls
          loop
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}
