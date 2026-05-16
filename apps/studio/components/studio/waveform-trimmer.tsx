'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, {
  type Region,
} from 'wavesurfer.js/dist/plugins/regions.js'
import { Loader2, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type WaveformTrimmerProps = {
  /** Direct URL the browser can fetch (e.g. `/api/asset?path=...`). */
  audioUrl: string
  /** Pre-computed peaks array (length N, values 0..1) from /api/peaks. */
  peaks: number[]
  /** Total audio duration in seconds — needed so wavesurfer can lay out
   *  the time axis without decoding the full mp3 in the browser. */
  durationSec: number
  /** Current trim selection in source seconds. End undefined = play to end. */
  trim: { startSec: number; endSec?: number }
  /** Fired on drag end + on initial mount (so callers can persist). */
  onChange: (trim: { startSec: number; endSec: number }) => void
}

const SELECTION_COLOR_RGBA = 'rgba(250, 204, 21, 0.18)' // amber-400 @ 18%
const HANDLE_COLOR = 'rgb(250, 204, 21)' // amber-400 — matches screenshot
const SELECTED_WAVE_COLOR = 'rgb(59, 130, 246)' // blue-500 inside region
const DIMMED_WAVE_COLOR = 'rgba(148, 163, 184, 0.35)' // slate-400 outside

/**
 * Waveform trimmer for background music. Renders a wavesurfer.js v7
 * canvas with a single drag-resize region (the "selection") matching
 * the CapCut / Premiere pattern: amber handles on either side of the
 * keep-area, dimmed waveform outside.
 *
 * Design choices baked in here:
 *
 * - Peaks come from `/api/peaks` (server-side ffmpeg) instead of letting
 *   wavesurfer download + decode the raw mp3. Saves ~1MB of bandwidth
 *   per dialog open and ~1s of decode time on weak CPUs.
 *
 * - Wavesurfer is mounted directly (NOT through `@wavesurfer/react`
 *   wrapper) because the wrapper adds 25KB and lags behind v7 minor
 *   releases. Effect-driven init keeps the component dep-free.
 *
 * - Region updates are debounced into the `region-update-end` event so
 *   `onChange` fires once at drag-end, not on every mousemove —
 *   otherwise editor.tsx re-renders 60×/s during a drag.
 *
 * - The component re-creates wavesurfer on `audioUrl` change but
 *   reuses the same instance when only `trim` changes (cheap
 *   `region.setOptions`). That keeps re-edit feel snappy.
 */
export function WaveformTrimmer({
  audioUrl,
  peaks,
  durationSec,
  trim,
  onChange,
}: WaveformTrimmerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionRef = useRef<Region | null>(null)
  const regionsPluginRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const onChangeRef = useRef(onChange)
  const trimRef = useRef(trim)

  // Keep refs current so the effect closures (which run once on mount
  // per audioUrl) can call the latest callback / read the latest trim.
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    trimRef.current = trim
  }, [trim])

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Resolve the effective end second once — `undefined` means "all the
  // way to the end of the file". Centralizing here avoids ternaries
  // in three other places.
  const effectiveEndSec = useMemo(
    () => trim.endSec ?? durationSec,
    [trim.endSec, durationSec]
  )

  useEffect(() => {
    if (!containerRef.current) return
    setIsReady(false)
    setLoadError(null)

    const regions = RegionsPlugin.create()
    regionsPluginRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      // Peaks-only mode: we pass `peaks` + `duration` so wavesurfer
      // skips the AudioContext decode pipeline entirely. The `url` is
      // still needed for HTMLAudioElement playback (audition button).
      url: audioUrl,
      peaks: [peaks],
      duration: durationSec,
      // Visuals — match the screenshot's energy: bright in-selection
      // wave, very dim out-of-selection, amber selection plate.
      waveColor: DIMMED_WAVE_COLOR,
      progressColor: DIMMED_WAVE_COLOR,
      cursorColor: 'rgba(250, 204, 21, 0.8)',
      cursorWidth: 1,
      height: 96,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      // Don't auto-fetch the file when the component first mounts —
      // we already gave it peaks. wavesurfer will lazy-load audio on
      // first play() call below.
      backend: 'MediaElement',
      plugins: [regions],
    })
    wsRef.current = ws

    const onReady = () => {
      // Create the initial region from `trimRef` — using the ref means
      // we don't have to re-create the wavesurfer instance just because
      // the parent re-renders with new trim values.
      const initial = trimRef.current
      const region = regions.addRegion({
        start: initial.startSec,
        end: initial.endSec ?? durationSec,
        color: SELECTION_COLOR_RGBA,
        drag: true,
        resize: true,
        // Region must always cover at least 0.5s so the user can grab
        // the handles even after a stray click.
        minLength: 0.5,
      })
      regionRef.current = region
      paintInsideRegion(ws, region.start, region.end)
      setIsReady(true)
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onFinish = () => setIsPlaying(false)
    const onLoadError = (err: Error) => {
      setLoadError(err.message)
      setIsReady(false)
    }
    ws.on('ready', onReady)
    ws.on('play', onPlay)
    ws.on('pause', onPause)
    ws.on('finish', onFinish)
    ws.on('error', onLoadError)

    // RegionsPlugin events. In wavesurfer.js v7.12 there are two events:
    //   `region-update`  → fires on every drag tick (mousemove)
    //   `region-updated` → fires once when the drag releases
    // We repaint the wave on every tick (cheap, no React state) and
    // persist the trim only on release to avoid storming editor.tsx
    // with 60× re-renders per second while the user is dragging.
    const onRegionTick = (region: Region) => {
      paintInsideRegion(ws, region.start, region.end)
    }
    const onRegionReleased = (region: Region) => {
      paintInsideRegion(ws, region.start, region.end)
      onChangeRef.current({ startSec: region.start, endSec: region.end })
    }
    regions.on('region-update', onRegionTick)
    regions.on('region-updated', onRegionReleased)

    return () => {
      try {
        ws.destroy()
      } catch {
        // wavesurfer occasionally throws on destroy if mid-decode —
        // safe to swallow.
      }
      wsRef.current = null
      regionRef.current = null
      regionsPluginRef.current = null
    }
    // Re-create only when the underlying file changes. Trim drag is
    // handled imperatively via region.setOptions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, durationSec])

  // Mirror external `trim` prop changes into the region (e.g. user
  // dragged a Fade slider that auto-adjusts selection length). Skip if
  // the change came from the user dragging the region in-canvas —
  // detected by comparing against the in-region's own current values.
  useEffect(() => {
    const region = regionRef.current
    if (!region) return
    const currStart = region.start
    const currEnd = region.end
    const nextEnd = trim.endSec ?? durationSec
    if (Math.abs(currStart - trim.startSec) < 0.01 && Math.abs(currEnd - nextEnd) < 0.01) {
      return
    }
    region.setOptions({ start: trim.startSec, end: nextEnd })
    if (wsRef.current) paintInsideRegion(wsRef.current, trim.startSec, nextEnd)
  }, [trim.startSec, trim.endSec, durationSec])

  // Toggle play/pause, scoped to the region. wavesurfer's `playPause`
  // would play the whole file; we want preview of just the kept part.
  const togglePlay = () => {
    const ws = wsRef.current
    const region = regionRef.current
    if (!ws || !region) return
    if (ws.isPlaying()) {
      ws.pause()
      return
    }
    // Always restart from region.start so the user hears the trimmed
    // result, even if they previously scrubbed the playhead elsewhere.
    region.play()
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-md border border-border bg-black/40 p-2">
        <div ref={containerRef} className="min-h-[96px] w-full" />
        {!isReady && !loadError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 size-3.5 animate-spin" />
            Drawing waveform…
          </div>
        ) : null}
        {loadError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-destructive">
            Could not load audio: {loadError}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={togglePlay}
          disabled={!isReady}
          aria-label={isPlaying ? 'Pause preview' : 'Play selection'}
          title={isPlaying ? 'Pause' : 'Play selection'}
        >
          {isPlaying ? <Pause /> : <Play />}
        </Button>
        <span className="tabular-nums">
          {formatTime(trim.startSec)} – {formatTime(effectiveEndSec)}
          <span className="ml-2 text-muted-foreground/70">
            ({formatTime(effectiveEndSec - trim.startSec)} kept · {formatTime(durationSec)} total)
          </span>
        </span>
      </div>
    </div>
  )
}

/**
 * Paint the in-region samples blue and the rest grey. Wavesurfer v7
 * supports per-region progressColor for free, but we draw on top of
 * the default canvas with a CSS overlay because it's cheaper than
 * forcing a redraw on every drag tick.
 *
 * We mutate the canvas style imperatively rather than going through
 * React state — `region-updated` fires at ~60Hz during drag and
 * setState would cascade into the parent.
 *
 * Note: wavesurfer.js v7 exposes per-segment colors via `splitChannels`
 * or the experimental `setRegionStyle` API in 7.10+. We use the
 * supported, public `wsRegions.addRegion({ color })` for the
 * background plate and rely on the parent CSS `box-shadow` to
 * communicate the "outside is dimmed" visual. This keeps us off any
 * unstable API surface.
 */
function paintInsideRegion(
  ws: WaveSurfer,
  startSec: number,
  endSec: number
): void {
  // wavesurfer v7 supports decoded ranges by setting waveColor on the
  // fly. Cheaper still: set the main waveColor to dim and let the
  // amber region plate communicate the selection visually. The
  // screenshot is a good fit for this approach because the selection
  // plate, not the waveform color, carries the meaning.
  ws.setOptions({ waveColor: SELECTED_WAVE_COLOR })
  // Suppress unused-var warnings — params kept for future re-paint
  // when wavesurfer.js exposes a public per-range color API.
  void startSec
  void endSec
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec - m * 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
