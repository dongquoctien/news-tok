'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Music, Volume2 } from 'lucide-react'
import type { AssetRef, BgMusicEdits } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import {
  TRIM_DEFAULT_EDITS,
  looksLikeDefault,
  smartDefaultTrim,
} from '@/lib/bg-music-trim'

// Lazy-load the waveform trimmer so wavesurfer.js (~50KB gzipped with
// the regions plugin) only ships when this dialog actually opens, and
// so the SSR pass for the editor doesn't try to evaluate a module that
// touches HTMLAudioElement at import time.
const WaveformTrimmer = dynamic(
  () => import('./waveform-trimmer').then((m) => m.WaveformTrimmer),
  { ssr: false, loading: () => <WaveformSkeleton /> }
)

type PeaksResponse = {
  peaks: number[]
  durationSec: number
  sampleCount: number
}

export type BgMusicTrimDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Track the user just picked. Required — dialog is only meaningful with one. */
  track: AssetRef | null
  /** Total video duration (sum of all segment durations). Drives the
   *  default selection length and the loop warning. */
  videoDurationSec: number
  /** Project bgMusicVolume — surfaced here so all bgMusic knobs live
   *  in one place. */
  initialVolume: number
  /** Current edits on the project. New tracks default to {} (legacy). */
  initialEdits: BgMusicEdits
  /**
   * Commit the new track + edits to project.bgMusic / bgMusicEdits /
   * bgMusicVolume in one round-trip. Called on Apply (with finalized
   * trim) or on Skip (with default edits = full track).
   */
  onApply: (next: {
    bgMusic: AssetRef
    bgMusicEdits: BgMusicEdits
    bgMusicVolume: number
  }) => void
}

export function BgMusicTrimDialog({
  open,
  onOpenChange,
  track,
  videoDurationSec,
  initialVolume,
  initialEdits,
  onApply,
}: BgMusicTrimDialogProps) {
  const [peaks, setPeaks] = useState<PeaksResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [edits, setEdits] = useState<BgMusicEdits>(initialEdits)
  const [volume, setVolume] = useState<number>(initialVolume)

  // Reset local state whenever the dialog opens for a different track.
  // Without this, picking track A → applying → picking track B would
  // open the dialog with A's trim values still visible.
  useEffect(() => {
    if (!open || !track) return
    setEdits(initialEdits)
    setVolume(initialVolume)
    setPeaks(null)
    setLoadError(null)
  }, [open, track, initialEdits, initialVolume])

  // Fetch peaks the first time the dialog opens for a track. We don't
  // memoize across opens — `/api/peaks` is itself content-hash cached
  // so a re-open is ~60ms anyway.
  useEffect(() => {
    if (!open || !track) return
    let cancelled = false
    const url = `/api/peaks?path=${encodeURIComponent(track.path)}&samples=1000`
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<PeaksResponse>
      })
      .then((body) => {
        if (cancelled) return
        setPeaks(body)
        // Apply smart default only if the user hasn't already trimmed
        // this project's music (or any previous one — looksLikeDefault
        // checks the whole edits object).
        if (looksLikeDefault(edits)) {
          const def = smartDefaultTrim(body.durationSec, videoDurationSec)
          setEdits((curr) => ({
            ...curr,
            trimStartSec: def.startSec,
            trimEndSec: def.endSec,
          }))
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
    // `edits` intentionally excluded — we only want to compute the
    // smart default once per open, not every time the user nudges a
    // slider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, track, videoDurationSec])

  const trim = useMemo(
    () => ({ startSec: edits.trimStartSec, endSec: edits.trimEndSec }),
    [edits.trimStartSec, edits.trimEndSec]
  )

  const audioUrl = useMemo(
    () => (track ? `/api/asset?path=${encodeURIComponent(track.path)}` : ''),
    [track]
  )

  const selectionSec =
    (edits.trimEndSec ?? peaks?.durationSec ?? 0) - edits.trimStartSec
  const willLoop = peaks != null && selectionSec > 0 && selectionSec < videoDurationSec

  const apply = () => {
    if (!track) return
    onApply({ bgMusic: track, bgMusicEdits: edits, bgMusicVolume: volume })
    onOpenChange(false)
  }

  const skip = () => {
    if (!track) return
    // Skip = use full track, default fades, no duck. Preserves the
    // legacy behavior so users who don't want to think can move on.
    onApply({
      bgMusic: track,
      bgMusicEdits: TRIM_DEFAULT_EDITS,
      bgMusicVolume: volume,
    })
    onOpenChange(false)
  }

  if (!track) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="size-5" />
            Trim background music
          </DialogTitle>
          <DialogDescription>
            Drag the amber handles to pick the loudest / most energetic part of
            the track. Your video is {formatTime(videoDurationSec)}.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Could not load waveform: {loadError}
          </div>
        ) : peaks == null ? (
          <WaveformSkeleton />
        ) : (
          <WaveformTrimmer
            audioUrl={audioUrl}
            peaks={peaks.peaks}
            durationSec={peaks.durationSec}
            trim={trim}
            onChange={(next) => {
              setEdits((curr) => ({
                ...curr,
                trimStartSec: next.startSec,
                trimEndSec: next.endSec,
              }))
            }}
          />
        )}

        {willLoop ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            Selection ({formatTime(selectionSec)}) is shorter than the video — the
            track will loop. Pick at least {formatTime(videoDurationSec)} for a
            seam-free render.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Slider
            label={
              <span className="inline-flex items-center gap-1">
                <Volume2 className="size-3" /> Volume
              </span>
            }
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={setVolume}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            resetTo={0.2}
          />
          <Slider
            label="Fade in"
            min={0}
            max={5}
            step={0.1}
            value={edits.fadeInSec}
            onChange={(v) => setEdits((curr) => ({ ...curr, fadeInSec: v }))}
            formatValue={(v) => `${v.toFixed(1)}s`}
            resetTo={0}
          />
          <Slider
            label="Fade out"
            min={0}
            max={5}
            step={0.1}
            value={edits.fadeOutSec}
            onChange={(v) => setEdits((curr) => ({ ...curr, fadeOutSec: v }))}
            formatValue={(v) => `${v.toFixed(1)}s`}
            resetTo={1.2}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={skip}>
            Skip trim, use full track
          </Button>
          <Button onClick={apply} disabled={peaks == null}>
            {peaks == null ? <Loader2 className="animate-spin" /> : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WaveformSkeleton() {
  return (
    <div className="flex h-[112px] items-center justify-center rounded-md border border-border bg-black/40 text-xs text-muted-foreground">
      <Loader2 className="mr-2 size-3.5 animate-spin" />
      Building waveform…
    </div>
  )
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec - m * 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
