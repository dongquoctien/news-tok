'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import { BUILT_IN_SFX, type SfxEntry, type TextSfx } from '@news-tok/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Slot = 'enter' | 'perWord'

type PreviewState = { sfxId: string; status: 'loading' | 'playing' | 'idle' }

/**
 * Per-segment SFX picker. Stores the user's choice as a `TextSfx` object
 * (the same shape used by TextStyle.sfx) into `segment.sfxOverride`.
 * `null` means "clear override" — fall back to the resolved style's sfx.
 */
export function SfxPicker({
  override,
  resolvedFromStyle,
  onChange,
  trigger,
}: {
  /** Current segment.sfxOverride, if any. */
  override: TextSfx | undefined
  /** What the renderer would play if override is cleared. */
  resolvedFromStyle: TextSfx | undefined
  onChange: (next: TextSfx | null) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  // Initialize draft from override if present, else from the resolved style,
  // so the dialog opens reflecting what the user currently hears.
  const initial = useMemo<TextSfx>(
    () =>
      override ?? {
        enterSoundId: resolvedFromStyle?.enterSoundId,
        enterVolume: resolvedFromStyle?.enterVolume ?? 0.6,
        perWordSoundId: resolvedFromStyle?.perWordSoundId,
        perWordVolume: resolvedFromStyle?.perWordVolume ?? 0.4,
      },
    [override, resolvedFromStyle]
  )
  const [draft, setDraft] = useState<TextSfx>(initial)
  const [preview, setPreview] = useState<PreviewState>({ sfxId: '', status: 'idle' })
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Reset draft each time the dialog opens, so a previous abandoned edit
  // doesn't leak into the new session.
  useEffect(() => {
    if (open) setDraft(initial)
  }, [open, initial])

  // Tear down the current preview audio without touching the state — the
  // caller decides whether to reset the picker UI. Crucially this nulls
  // the audio's event handlers BEFORE pausing/clearing src, so the
  // forthcoming "error" event the browser fires when src is cleared
  // can't race with a fresh playPreview() that already updated state.
  const teardownAudio = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.onended = null
    audio.oncanplay = null
    audio.onerror = null
    audio.pause()
    audio.src = ''
    audioRef.current = null
  }

  const stopPreview = () => {
    teardownAudio()
    setPreview({ sfxId: '', status: 'idle' })
  }

  // Preview audio is served via /api/sfx/[id], which streams the bank
  // file from packages/shared/sfx/. Going through a dedicated endpoint
  // avoids leaking the absolute repo path through query strings and
  // sidesteps the cwd-vs-allowlist mismatch of /api/asset.
  const previewUrl = (sfxId: string) => `/api/sfx/${encodeURIComponent(sfxId)}`

  const playPreview = (sfxId: string) => {
    teardownAudio()
    const audio = new Audio(previewUrl(sfxId))
    audioRef.current = audio
    setPreview({ sfxId, status: 'loading' })
    // Guard each handler so an event firing on a stale audio element
    // (e.g. canplay arriving after the user clicked a different tile)
    // can't stomp the state of whichever preview is currently active.
    audio.oncanplay = () => {
      if (audioRef.current !== audio) return
      setPreview({ sfxId, status: 'playing' })
      void audio.play().catch(() => stopPreview())
    }
    audio.onended = () => {
      if (audioRef.current !== audio) return
      stopPreview()
    }
    audio.onerror = () => {
      if (audioRef.current !== audio) return
      stopPreview()
    }
  }

  useEffect(() => () => stopPreview(), [])

  const setSlot = (slot: Slot, sfxId: string | undefined) => {
    setDraft((d) => ({
      ...d,
      [slot === 'enter' ? 'enterSoundId' : 'perWordSoundId']: sfxId,
    }))
  }

  const setVolume = (slot: Slot, vol: number) => {
    setDraft((d) => ({
      ...d,
      [slot === 'enter' ? 'enterVolume' : 'perWordVolume']: vol,
    }))
  }

  const apply = () => {
    onChange(draft)
    setOpen(false)
  }

  const clearOverride = () => {
    onChange(null)
    setOpen(false)
  }

  const summary = override
    ? [override.enterSoundId, override.perWordSoundId].filter(Boolean).join(' · ') ||
      'silenced'
    : resolvedFromStyle?.enterSoundId || resolvedFromStyle?.perWordSoundId
      ? 'inherits from style'
      : 'none'

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : (stopPreview(), setOpen(false)))}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="size-5" />
            Sound effect
          </DialogTitle>
          <DialogDescription>
            Pick a transition cue for this segment. The "Enter" cue fires once
            when the segment starts; the "Per word" cue fires on every spoken
            word (uses Edge TTS word boundaries). Click a tile to audition.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <SlotPicker
            slot="enter"
            label="Enter cue"
            currentId={draft.enterSoundId}
            currentVolume={draft.enterVolume ?? 0.6}
            preview={preview}
            onPlay={playPreview}
            onStop={stopPreview}
            onPick={(id) => setSlot('enter', id)}
            onVolume={(v) => setVolume('enter', v)}
          />
          <SlotPicker
            slot="perWord"
            label="Per-word cue"
            currentId={draft.perWordSoundId}
            currentVolume={draft.perWordVolume ?? 0.4}
            preview={preview}
            onPlay={playPreview}
            onStop={stopPreview}
            onPick={(id) => setSlot('perWord', id)}
            onVolume={(v) => setVolume('perWord', v)}
          />
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Current: <span className="font-medium text-foreground">{summary}</span>
          </div>
          <div className="flex items-center gap-2">
            {override ? (
              <Button variant="outline" size="sm" onClick={clearOverride}>
                <RotateCcw />
                Use style default
              </Button>
            ) : null}
            <Button size="sm" onClick={apply}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SlotPicker({
  slot,
  label,
  currentId,
  currentVolume,
  preview,
  onPlay,
  onStop,
  onPick,
  onVolume,
}: {
  slot: Slot
  label: string
  currentId: string | undefined
  currentVolume: number
  preview: PreviewState
  onPlay: (sfxId: string) => void
  onStop: () => void
  onPick: (sfxId: string | undefined) => void
  onVolume: (v: number) => void
}) {
  const volumePct = Math.round(currentVolume * 100)
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs uppercase tracking-wide">{label}</Label>
        <button
          type="button"
          onClick={() => onPick(undefined)}
          className={cn(
            'text-[10px] uppercase tracking-wide transition-colors',
            currentId
              ? 'text-muted-foreground hover:text-foreground'
              : 'font-medium text-primary'
          )}
        >
          None
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BUILT_IN_SFX.map((entry) => (
          <SfxTile
            key={entry.id}
            entry={entry}
            selected={currentId === entry.id}
            preview={preview}
            onPlay={onPlay}
            onStop={onStop}
            onPick={onPick}
          />
        ))}
      </div>
      {currentId ? (
        <div className="flex items-center gap-3 rounded-md border bg-secondary/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumePct}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10) / 100
              if (Number.isFinite(v)) onVolume(v)
            }}
            className="h-2 flex-1 cursor-pointer accent-primary"
          />
          <span className="w-10 text-right tabular-nums text-muted-foreground">
            {volumePct}%
          </span>
        </div>
      ) : null}
    </div>
  )
}

function SfxTile({
  entry,
  selected,
  preview,
  onPlay,
  onStop,
  onPick,
}: {
  entry: SfxEntry
  selected: boolean
  preview: PreviewState
  onPlay: (sfxId: string) => void
  onStop: () => void
  onPick: (sfxId: string) => void
}) {
  const isLoading = preview.sfxId === entry.id && preview.status === 'loading'
  const isPlaying = preview.sfxId === entry.id && preview.status === 'playing'
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'hover:border-muted-foreground/40 hover:bg-secondary/40'
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (isPlaying || isLoading) onStop()
          else onPlay(entry.id)
        }}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-foreground"
        title={`Preview ${entry.label}`}
        aria-label={isPlaying ? 'Stop preview' : 'Play preview'}
      >
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onPick(entry.id)}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
        title={`Pick ${entry.label}`}
      >
        <span className="truncate font-medium">{entry.label}</span>
        <span className="truncate text-[10px] text-muted-foreground">
          {entry.durationSec}s · {entry.source}
        </span>
      </button>
    </div>
  )
}
