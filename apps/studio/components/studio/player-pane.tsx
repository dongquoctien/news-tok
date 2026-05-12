'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { ASPECT_PRESETS, type AssetRef, type Project, type Segment } from '@news-tok/shared/schema'
import { NewsTokComposition } from '@news-tok/remotion/compositions/NewsTokComposition'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'

function rewriteAsset<T extends AssetRef | undefined>(asset: T): T {
  if (!asset) return asset
  const url = assetUrl(asset.path)
  if (!url) return asset
  return { ...asset, path: url } as T
}

function rewriteSegment(segment: Segment): Segment {
  return {
    ...segment,
    visuals: {
      background: rewriteAsset(segment.visuals.background),
      foreground: segment.visuals.foreground?.map((a) => rewriteAsset(a)),
    },
    audio: segment.audio
      ? {
          narration: rewriteAsset(segment.audio.narration),
          sfx: segment.audio.sfx?.map((a) => rewriteAsset(a)),
        }
      : undefined,
  }
}

function rewriteProject(project: Project): Project {
  return {
    ...project,
    segments: project.segments.map(rewriteSegment),
    bgMusic: rewriteAsset(project.bgMusic),
  }
}

export type PlayerPaneProps = {
  project: Project
  selectedSegmentId?: string | null
  onSelectSegment?: (id: string) => void
  /**
   * If set, the in-browser preview renders that variant. Omitting it
   * leaves the composition to its own variant-resolution logic (first
   * declared variant wins).
   */
  previewVariantId?: string | null
}

export function PlayerPane({
  project,
  selectedSegmentId,
  onSelectSegment,
  previewVariantId,
}: PlayerPaneProps) {
  const preset = ASPECT_PRESETS[project.aspect]
  const totalSec = project.segments.reduce((sum, s) => sum + s.durationSec, 0)
  const durationInFrames = Math.max(1, Math.round(totalSec * preset.fps))
  const playerProject = useMemo(() => rewriteProject(project), [project])
  const playerRef = useRef<PlayerRef>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const timeLabelRef = useRef<HTMLSpanElement>(null)

  const segmentMarkers = useMemo(() => {
    let cursor = 0
    return project.segments.map((s) => {
      const startSec = cursor
      const dur = s.durationSec
      cursor += dur
      return {
        id: s.id,
        scene: s.scene,
        startSec,
        endSec: startSec + dur,
        widthPct: (dur / Math.max(totalSec, 0.001)) * 100,
        startPct: (startSec / Math.max(totalSec, 0.001)) * 100,
      }
    })
  }, [project.segments, totalSec])

  // Drive the playhead via rAF + direct DOM writes so we never trigger a
  // React re-render of <Player>. Re-rendering the Player while it's
  // playing causes the Remotion <Audio> children to remount and the
  // narration stutters.
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    let raf = 0
    const tick = () => {
      const frame = player.getCurrentFrame()
      const sec = frame / preset.fps
      const head = playheadRef.current
      const label = timeLabelRef.current
      if (head) {
        head.style.left = `${(sec / Math.max(totalSec, 0.001)) * 100}%`
      }
      if (label) {
        label.textContent = `${sec.toFixed(1)}s`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [preset.fps, totalSec])

  const seekToSegment = (segmentStartSec: number, id: string) => {
    const player = playerRef.current
    if (player) {
      const frame = Math.round(segmentStartSec * preset.fps)
      player.seekTo(frame)
    }
    onSelectSegment?.(id)
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="w-full max-w-[420px]">
        <Player
          ref={playerRef}
          component={NewsTokComposition}
          inputProps={{
            storyboard: playerProject,
            variantId: previewVariantId ?? undefined,
          }}
          durationInFrames={durationInFrames}
          fps={preset.fps}
          compositionWidth={preset.width}
          compositionHeight={preset.height}
          controls
          loop
          style={{ width: '100%' }}
        />
      </div>
      {segmentMarkers.length > 0 ? (
        <div className="w-full max-w-[420px] space-y-1">
          <div className="relative flex h-6 w-full overflow-hidden rounded-md border border-border bg-secondary/40">
            {segmentMarkers.map((m) => (
              <button
                key={m.id}
                onClick={() => seekToSegment(m.startSec, m.id)}
                className={cn(
                  'group relative h-full border-r border-border/60 px-1 text-left text-[10px] font-semibold uppercase tracking-wide transition-colors last:border-r-0',
                  m.id === selectedSegmentId
                    ? 'bg-primary/30 text-foreground'
                    : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                )}
                style={{ width: `${m.widthPct}%` }}
                title={`${m.scene} · ${m.endSec - m.startSec}s`}
              >
                <span className="truncate">{m.scene}</span>
              </button>
            ))}
            <div
              ref={playheadRef}
              aria-hidden
              className="pointer-events-none absolute top-0 h-full w-px bg-amber-300 shadow-[0_0_4px_rgba(252,211,77,0.8)]"
              style={{ left: '0%' }}
            />
          </div>
          <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span ref={timeLabelRef}>0.0s</span>
            <span>{totalSec.toFixed(1)}s</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
