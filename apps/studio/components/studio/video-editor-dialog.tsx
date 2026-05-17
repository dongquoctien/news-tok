'use client'

/**
 * VideoEditorDialog — knob panel for a background video clip already
 * assigned to a segment. Covers:
 *   - Trim (filmstrip handles)
 *   - Loop on/off + freeze fallback when off
 *   - Mute toggle + volume slider (volume disabled while muted)
 *   - Playback speed slider 0.25..2x
 *   - Fit mode (cover | contain | fill) + 9-position align grid for contain
 *
 * The dialog is controlled-output: parent owns the segment's video
 * fields and receives a single `onApply()` payload. We collapse any
 * field that matches the renderer default to `undefined` so a
 * never-touched setting doesn't bloat storyboard.json.
 *
 * The narration auto-mute rule lives in the renderer; this dialog only
 * shows a hint banner when the user un-mutes so they know what'll
 * happen at render time.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Mic,
  MicOff,
  Pause,
  Play,
  Repeat,
  RotateCw,
  Settings2,
  SkipBack,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { AssetRef, Segment } from '@news-tok/shared/schema'
import { assetUrl } from '@/lib/asset-url'
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
import { cn } from '@/lib/utils'
import { FilmstripTrimmer, type FilmstripTrim } from './filmstrip-trimmer'

type VideoFit = 'cover' | 'contain' | 'fill'

type VideoAlign =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export type VideoEditorResult = {
  videoTrim?: { startSec: number; endSec?: number }
  videoLoop?: boolean
  videoMuted?: boolean
  videoVolume?: number
  videoAudioFadeInSec?: number
  videoAudioFadeOutSec?: number
  videoPlaybackRate?: number
  videoFit?: VideoFit
  videoAlign?: VideoAlign
  /**
   * Mirror the clip horizontally / vertically. Stored on the segment's
   * `backgroundEdits` (shared with the image editor) rather than the
   * video-specific bucket because the renderer's KenBurns effect
   * already handles flipH/flipV uniformly for both image and video.
   * The parent component is responsible for stitching these two flags
   * into `segment.backgroundEdits`.
   */
  flipH?: boolean
  flipV?: boolean
}

export type VideoEditorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The background video asset the segment uses. */
  asset: AssetRef
  /** Initial values from the segment. All fields optional. */
  initial: VideoEditorResult
  /** Project aspect — drives the preview tile aspect-ratio. */
  projectAspect: '9:16' | '16:9' | '1:1'
  /** Commit the new values back. Caller stitches onto `segment.*`. */
  onApply: (next: VideoEditorResult) => void
}

const ALIGN_GRID: VideoAlign[] = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

function alignToCss(align: VideoAlign): string {
  const [v, h] = align.split('-') as [string, string | undefined]
  if (!h) return 'center center'
  return `${h} ${v}`
}

/** Round to 2 decimals to keep storyboard.json tidy. */
function trimDecimals(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Collapse renderer-default values to undefined so we never store a
 * "user touched nothing" segment with a full set of explicit flags.
 * Mirrors the per-field defaults documented in `Segment.videoLoop` etc.
 */
function collapseDefaults(raw: VideoEditorResult): VideoEditorResult {
  const out: VideoEditorResult = {}
  if (raw.videoTrim) {
    const { startSec, endSec } = raw.videoTrim
    const startNonDefault = startSec > 0.01
    const endNonDefault = typeof endSec === 'number'
    if (startNonDefault || endNonDefault) {
      out.videoTrim = {
        startSec: trimDecimals(Math.max(0, startSec)),
        ...(typeof endSec === 'number' ? { endSec: trimDecimals(endSec) } : {}),
      }
    }
  }
  if (raw.videoLoop === false) out.videoLoop = false
  if (raw.videoMuted === false) out.videoMuted = false
  if (typeof raw.videoVolume === 'number' && Math.abs(raw.videoVolume - 1) > 0.001)
    out.videoVolume = trimDecimals(raw.videoVolume)
  if (typeof raw.videoAudioFadeInSec === 'number' && raw.videoAudioFadeInSec > 0.001)
    out.videoAudioFadeInSec = trimDecimals(raw.videoAudioFadeInSec)
  if (typeof raw.videoAudioFadeOutSec === 'number' && raw.videoAudioFadeOutSec > 0.001)
    out.videoAudioFadeOutSec = trimDecimals(raw.videoAudioFadeOutSec)
  if (
    typeof raw.videoPlaybackRate === 'number' &&
    Math.abs(raw.videoPlaybackRate - 1) > 0.001
  )
    out.videoPlaybackRate = trimDecimals(raw.videoPlaybackRate)
  if (raw.videoFit && raw.videoFit !== 'cover') out.videoFit = raw.videoFit
  if (raw.videoAlign && raw.videoAlign !== 'center') out.videoAlign = raw.videoAlign
  if (raw.flipH) out.flipH = true
  if (raw.flipV) out.flipV = true
  return out
}

const ASPECT_RATIO_CSS: Record<'9:16' | '16:9' | '1:1', string> = {
  '9:16': '9 / 16',
  '16:9': '16 / 9',
  '1:1': '1 / 1',
}

export function VideoEditorDialog({
  open,
  onOpenChange,
  asset,
  initial,
  projectAspect,
  onApply,
}: VideoEditorDialogProps) {
  // Local state — committed only on Apply. Cancel = drop changes.
  const [trim, setTrim] = useState<FilmstripTrim>(() => ({
    startSec: initial.videoTrim?.startSec ?? 0,
    endSec: initial.videoTrim?.endSec,
  }))
  const [loop, setLoop] = useState<boolean>(initial.videoLoop ?? true)
  const [muted, setMuted] = useState<boolean>(initial.videoMuted ?? true)
  const [volume, setVolume] = useState<number>(initial.videoVolume ?? 1)
  const [audioFadeIn, setAudioFadeIn] = useState<number>(
    initial.videoAudioFadeInSec ?? 0
  )
  const [audioFadeOut, setAudioFadeOut] = useState<number>(
    initial.videoAudioFadeOutSec ?? 0
  )
  const [rate, setRate] = useState<number>(initial.videoPlaybackRate ?? 1)
  const [fit, setFit] = useState<VideoFit>(initial.videoFit ?? 'cover')
  const [align, setAlign] = useState<VideoAlign>(initial.videoAlign ?? 'center')
  const [flipH, setFlipH] = useState<boolean>(initial.flipH ?? false)
  const [flipV, setFlipV] = useState<boolean>(initial.flipV ?? false)

  // Re-seed local state whenever the dialog opens for a different
  // segment. Without this, switching from segment A → segment B with
  // the dialog already open would keep A's knobs.
  useEffect(() => {
    if (!open) return
    setTrim({
      startSec: initial.videoTrim?.startSec ?? 0,
      endSec: initial.videoTrim?.endSec,
    })
    setLoop(initial.videoLoop ?? true)
    setMuted(initial.videoMuted ?? true)
    setVolume(initial.videoVolume ?? 1)
    setAudioFadeIn(initial.videoAudioFadeInSec ?? 0)
    setAudioFadeOut(initial.videoAudioFadeOutSec ?? 0)
    setRate(initial.videoPlaybackRate ?? 1)
    setFit(initial.videoFit ?? 'cover')
    setAlign(initial.videoAlign ?? 'center')
    setFlipH(initial.flipH ?? false)
    setFlipV(initial.flipV ?? false)
  }, [open, initial])

  // Preview <video> element. Keeping a ref lets the filmstrip handle
  // drag seek the same element so the preview frame follows the start
  // handle in real time.
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // Mirror the underlying <video>.paused flag so the play/pause button
  // icon stays in sync even when playback ends, the user scrubs, or the
  // dialog re-opens.
  const [isPlaying, setIsPlaying] = useState(true)
  // Current playhead in seconds — shown next to the play button so
  // users can land on a precise frame without scrubbing into the
  // trim handles.
  const [currentSec, setCurrentSec] = useState(0)

  // Compute up here so the playback listener effect can depend on it.
  const sourceUrl = useMemo(() => assetUrl(asset.path) ?? '', [asset.path])

  // Wire up <video> events so React state mirrors the element. We use
  // event listeners (not just the DOM property) because programmatic
  // pause()/play() calls and end-of-clip events both need to flip the
  // icon without an extra setState in the caller.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTime = () => setCurrentSec(v.currentTime)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onPause)
    v.addEventListener('timeupdate', onTime)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onPause)
      v.removeEventListener('timeupdate', onTime)
    }
  }, [sourceUrl])

  // Push muted / volume / rate / current trim back to the preview
  // element whenever the user adjusts a knob. Fit/align are styled via
  // inline style below, not via DOM property.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = muted
    v.volume = muted ? 0 : Math.max(0, Math.min(1, volume))
    v.playbackRate = Math.max(0.25, Math.min(2, rate))
  }, [muted, volume, rate])

  // Seek when the start of the window changes, so the live preview
  // always frames the in-point.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    try {
      v.currentTime = trim.startSec
    } catch {
      // not seekable yet — first metadata load not done. Browser will
      // pick up the assigned currentTime once metadata arrives.
    }
  }, [trim.startSec])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      // If the playhead has run past the trim end, snap back to start
      // so "Play" feels like "play the selection again" instead of
      // resuming dead-air after the out-point.
      const endSec = trim.endSec ?? (asset.durationSec ?? Infinity)
      if (v.currentTime >= endSec - 0.05) {
        try {
          v.currentTime = trim.startSec
        } catch {
          /* not seekable yet */
        }
      }
      void v.play().catch(() => {
        // Autoplay-policy block on first interaction is rare here
        // because the dialog is opened by a click, but swallow
        // defensively.
      })
    } else {
      v.pause()
    }
  }

  const rewindToStart = () => {
    const v = videoRef.current
    if (!v) return
    try {
      v.currentTime = trim.startSec
    } catch {
      /* not seekable yet */
    }
  }

  const totalSec = asset.durationSec ?? 0
  const trimmedSec = (trim.endSec ?? totalSec) - trim.startSec
  const previewObjectPosition = alignToCss(align)
  // Mirror the renderer's flip stack order so the dialog preview
  // matches the final output. Empty string when no flip is on keeps
  // the inline style from layout-thrashing on first paint.
  const previewFlipTransform = `${flipH ? 'scaleX(-1) ' : ''}${flipV ? 'scaleY(-1)' : ''}`.trim() || undefined

  const handleApply = () => {
    const collapsed = collapseDefaults({
      videoTrim: trim,
      videoLoop: loop,
      videoMuted: muted,
      videoVolume: volume,
      videoAudioFadeInSec: audioFadeIn,
      videoAudioFadeOutSec: audioFadeOut,
      videoPlaybackRate: rate,
      videoFit: fit,
      videoAlign: align,
      flipH,
      flipV,
    })
    onApply(collapsed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="size-4" />
            Edit video background
          </DialogTitle>
          <DialogDescription>
            Trim the clip, control loop & audio, and pick how it fills the
            segment. Changes apply only to this segment — the library asset
            stays untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
          {/* Left column — preview + filmstrip trimmer. */}
          <div className="space-y-3">
            <div
              className="group relative w-full overflow-hidden rounded-md border bg-black"
              style={{
                aspectRatio: ASPECT_RATIO_CSS[projectAspect],
                maxHeight: '60vh',
              }}
            >
              {sourceUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  ref={videoRef}
                  src={sourceUrl}
                  autoPlay
                  loop
                  playsInline
                  // muted attribute must be on the JSX element itself —
                  // not just set via `v.muted = muted` in a useEffect —
                  // because <video autoPlay> starts before the effect
                  // runs, so a "muted by default" dialog would still
                  // emit audio for ~100ms before the effect catches up.
                  // Browsers also REQUIRE the attribute up front to
                  // honor autoplay without a user gesture.
                  muted={muted}
                  onClick={togglePlay}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: fit,
                    objectPosition: previewObjectPosition,
                    backgroundColor: '#000',
                    cursor: 'pointer',
                    transform: previewFlipTransform,
                  }}
                />
              ) : null}
              {/* Big centered play overlay — only visible while paused
                  so it doesn't obscure the moving image during normal
                  preview. Hover state of the wrapper keeps it visible
                  even when playing, mirroring the YouTube pattern. */}
              {!isPlaying ? (
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label="Play"
                  className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40"
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
                    <Play className="size-7" fill="currentColor" />
                  </span>
                </button>
              ) : null}
              {/* Bottom transport bar — small but always visible so the
                  user can scrub-by-clicking or pause without leaving
                  the preview area. */}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 text-white">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="rounded p-1 hover:bg-white/10"
                  title={isPlaying ? 'Pause (or click the video)' : 'Play (or click the video)'}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" fill="currentColor" />}
                </button>
                <button
                  type="button"
                  onClick={rewindToStart}
                  className="rounded p-1 hover:bg-white/10"
                  title="Jump to trim start"
                  aria-label="Jump to trim start"
                >
                  <SkipBack className="size-4" />
                </button>
                <span className="font-mono text-[10px] tabular-nums opacity-80">
                  {currentSec.toFixed(2)}s / {totalSec.toFixed(2)}s
                </span>
              </div>
            </div>

            <FilmstripTrimmer
              assetPath={asset.path}
              durationSec={totalSec}
              trim={trim}
              onChange={(t) => setTrim(t)}
              previewRef={videoRef}
            />
          </div>

          {/* Right column — knob sections. */}
          <div className="space-y-4">
            {/* Playback section */}
            <section className="space-y-2 rounded-md border p-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <RotateCw className="size-3.5" />
                Playback
              </h4>
              <label className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <Repeat className="size-3.5" />
                  Loop when shorter than segment
                </span>
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => setLoop(e.target.checked)}
                  className="size-4 cursor-pointer accent-amber-500"
                />
              </label>
              <p className="text-[10px] text-muted-foreground">
                {loop
                  ? 'Trimmed clip will repeat to fill the segment.'
                  : 'Clip plays once, then freezes on the last frame.'}
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>Speed</span>
                  <span className="font-mono text-muted-foreground">
                    {rate.toFixed(2)}×
                  </span>
                </div>
                <Slider
                  min={0.25}
                  max={2}
                  step={0.05}
                  value={rate}
                  onChange={(v) => setRate(v)}
                  ariaLabel="Playback speed"
                />
              </div>
            </section>

            {/* Audio section */}
            <section className="space-y-2 rounded-md border p-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Volume2 className="size-3.5" />
                Audio
              </h4>
              <label className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                  Mute clip audio
                </span>
                <input
                  type="checkbox"
                  checked={muted}
                  onChange={(e) => setMuted(e.target.checked)}
                  className="size-4 cursor-pointer accent-amber-500"
                />
              </label>
              <div className={cn('space-y-1', muted && 'opacity-50')}>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    {volume === 0 ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                    Volume
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(v) => setVolume(v)}
                  ariaLabel="Clip audio volume"
                />
              </div>
              {/* Audio fade in / out — keep visible regardless of mute
                  state so the user can pre-author the ramp before
                  flipping mute off. Stored independently of the visual
                  fadeIn/fadeOut on the segment so audio can ramp
                  longer than the visual cut. */}
              <div className={cn('space-y-1', muted && 'opacity-50')}>
                <div className="flex items-center justify-between text-xs">
                  <span>Audio fade in</span>
                  <span className="font-mono text-muted-foreground">
                    {audioFadeIn.toFixed(1)}s
                  </span>
                </div>
                <Slider
                  min={0}
                  max={3}
                  step={0.1}
                  value={audioFadeIn}
                  onChange={(v) => setAudioFadeIn(v)}
                  ariaLabel="Audio fade in seconds"
                />
              </div>
              <div className={cn('space-y-1', muted && 'opacity-50')}>
                <div className="flex items-center justify-between text-xs">
                  <span>Audio fade out</span>
                  <span className="font-mono text-muted-foreground">
                    {audioFadeOut.toFixed(1)}s
                  </span>
                </div>
                <Slider
                  min={0}
                  max={3}
                  step={0.1}
                  value={audioFadeOut}
                  onChange={(v) => setAudioFadeOut(v)}
                  ariaLabel="Audio fade out seconds"
                />
              </div>
              {!muted ? (
                <p className="rounded bg-secondary/40 px-2 py-1 text-[10px] text-muted-foreground">
                  Clip audio mixes with narration TTS. Use fade-out to
                  avoid a harsh cut when the segment ends mid-clip.
                </p>
              ) : null}
            </section>

            {/* Flip section — orientation knobs are conceptually
                upstream of fit (you decide which way the clip faces
                before you decide how it fills the frame). */}
            <section className="space-y-2 rounded-md border p-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FlipHorizontal className="size-3.5" />
                Flip
              </h4>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFlipH((v) => !v)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                    flipH
                      ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-border hover:bg-secondary'
                  )}
                  title="Mirror left-right (useful when the subject faces the wrong way)"
                  aria-pressed={flipH}
                >
                  <FlipHorizontal className="size-3.5" />
                  Horizontal
                </button>
                <button
                  type="button"
                  onClick={() => setFlipV((v) => !v)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                    flipV
                      ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-border hover:bg-secondary'
                  )}
                  title="Mirror top-bottom (rarely needed)"
                  aria-pressed={flipV}
                >
                  <FlipVertical className="size-3.5" />
                  Vertical
                </button>
              </div>
            </section>

            {/* Fit & Align section */}
            <section className="space-y-2 rounded-md border p-3">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Maximize2 className="size-3.5" />
                Fit &amp; align
              </h4>
              <div className="grid grid-cols-3 gap-1.5">
                {(['cover', 'contain', 'fill'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFit(mode)}
                    className={cn(
                      'rounded border px-2 py-1.5 text-xs font-medium capitalize transition-colors',
                      fit === mode
                        ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'border-border hover:bg-secondary'
                    )}
                    title={
                      mode === 'cover'
                        ? 'Fill the segment frame, crop overflow.'
                        : mode === 'contain'
                          ? 'Letterbox the clip inside the segment.'
                          : 'Stretch the clip to the segment aspect.'
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* 9-position align grid — only enabled when fit=contain.
                  cover and fill always fill the frame so position has
                  no visible effect. */}
              <div className={cn('space-y-1', fit !== 'contain' && 'opacity-40')}>
                <p className="text-[10px] text-muted-foreground">
                  Align (only matters with <code>contain</code>)
                </p>
                <div className="grid w-fit grid-cols-3 gap-1">
                  {ALIGN_GRID.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAlign(a)}
                      disabled={fit !== 'contain'}
                      className={cn(
                        'flex size-7 items-center justify-center rounded border transition-colors',
                        align === a
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-border hover:bg-secondary',
                        fit !== 'contain' && 'cursor-not-allowed'
                      )}
                      title={a}
                      aria-label={`Align ${a}`}
                    >
                      <span
                        className={cn(
                          'block size-2 rounded-full',
                          align === a ? 'bg-amber-500' : 'bg-muted-foreground/40'
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-md border p-3 text-[10px] text-muted-foreground">
              <p className="flex items-center gap-1">
                <Settings2 className="size-3" />
                Selected window:{' '}
                <span className="font-mono">
                  {trimmedSec > 0 ? trimmedSec.toFixed(2) : '0'}s
                </span>{' '}
                of <span className="font-mono">{totalSec.toFixed(2)}s</span>
              </p>
            </section>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Convenience helper — build the initial dialog state from a Segment.
 * Lets the caller (image-library or segment inspector) just pass the
 * segment without restating every field name.
 */
export function videoEditorInitial(segment: Segment): VideoEditorResult {
  return {
    videoTrim: segment.videoTrim,
    videoLoop: segment.videoLoop,
    videoMuted: segment.videoMuted,
    videoVolume: segment.videoVolume,
    videoAudioFadeInSec: segment.videoAudioFadeInSec,
    videoAudioFadeOutSec: segment.videoAudioFadeOutSec,
    videoPlaybackRate: segment.videoPlaybackRate,
    videoFit: segment.videoFit,
    videoAlign: segment.videoAlign,
    flipH: segment.backgroundEdits?.flipH,
    flipV: segment.backgroundEdits?.flipV,
  }
}
