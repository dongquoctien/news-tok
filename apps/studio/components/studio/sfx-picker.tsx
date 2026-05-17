'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  BUILT_IN_SFX,
  type CustomSfxEntry,
  type SfxEntry,
  type TextSfx,
} from '@news-tok/shared'
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
 *
 * Two banks are shown:
 *   - Built-in: 12 cues committed in `packages/shared/sfx/`. Served via
 *     `/api/sfx/<id>`.
 *   - Custom: user-uploaded mp3s scoped to this project. Served via
 *     `/api/projects/<projectId>/sfx/<slug>`. CRUD goes through
 *     `/api/projects/<projectId>/sfx`.
 */
export function SfxPicker({
  projectId,
  customSfx,
  override,
  resolvedFromStyle,
  onChange,
  onApplyToAll,
  onCustomSfxChange,
  trigger,
}: {
  projectId: string
  customSfx: CustomSfxEntry[]
  /** Current segment.sfxOverride, if any. */
  override: TextSfx | undefined
  /** What the renderer would play if override is cleared. */
  resolvedFromStyle: TextSfx | undefined
  onChange: (next: TextSfx | null) => void
  /** When set, the dialog footer shows an "Apply to all segments"
   *  action. The parent should write the passed TextSfx to every
   *  segment's sfxOverride — including the "all-None" case, where an
   *  empty-but-present override is what silences cues across the
   *  project (clearing the override would let the text style's built-in
   *  SFX leak through). */
  onApplyToAll?: (next: TextSfx) => void
  /** Called after a successful upload or delete so the parent can refresh. */
  onCustomSfxChange: (next: CustomSfxEntry[]) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
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

  useEffect(() => {
    if (open) setDraft(initial)
  }, [open, initial])

  const teardownAudio = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.onended = null
    audio.oncanplay = null
    audio.onerror = null
    audio.pause()
    // Force the browser to release the underlying media handle. Just
    // setting `audio.src = ''` keeps Chrome attached to the WASAPI
    // session in some builds; `removeAttribute + load()` is the
    // documented "release everything" sequence and helps avoid the
    // Windows 11 build 26200 audiosrv stale-handle freeze.
    try {
      audio.removeAttribute('src')
      audio.load()
    } catch {
      // best-effort
    }
    audioRef.current = null
  }

  const stopPreview = () => {
    teardownAudio()
    setPreview({ sfxId: '', status: 'idle' })
  }

  // Built-in bank ids start with no prefix; custom ids start with "user-".
  // The picker uses this to route preview audio to the right endpoint.
  const previewUrl = (sfxId: string) =>
    sfxId.startsWith('user-')
      ? `/api/projects/${encodeURIComponent(projectId)}/sfx/${encodeURIComponent(sfxId)}`
      : `/api/sfx/${encodeURIComponent(sfxId)}`

  const playPreview = (sfxId: string) => {
    teardownAudio()
    const audio = new Audio(previewUrl(sfxId))
    audioRef.current = audio
    setPreview({ sfxId, status: 'loading' })
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

  const applyToAll = () => {
    if (!onApplyToAll) return
    // Always pass the draft as-is (never null). The renderer resolves
    //   segment.sfxOverride ?? style.sfx
    // — so a *present-but-empty* override is what silences a segment.
    // Passing null would clear the override and let the text style's
    // built-in SFX leak back through (most styles ship with default
    // enterSoundId / perWordSoundId), which is exactly the "I picked
    // None but other segments still play" bug.
    onApplyToAll(draft)
    setOpen(false)
  }

  const clearOverride = () => {
    onChange(null)
    setOpen(false)
  }

  const labelFor = (sfxId: string | undefined): string => {
    if (!sfxId) return ''
    const builtIn = BUILT_IN_SFX.find((s) => s.id === sfxId)
    if (builtIn) return builtIn.label
    const custom = customSfx.find((s) => s.id === sfxId)
    if (custom) return custom.label
    // The override still references a custom entry that's been deleted
    // from the bank. Show that explicitly so the footer doesn't read like
    // the cue still works — Apply with a stale id would just play silence.
    return `${sfxId} (deleted)`
  }

  const summary = override
    ? [labelFor(override.enterSoundId), labelFor(override.perWordSoundId)]
        .filter(Boolean)
        .join(' · ') || 'silenced'
    : resolvedFromStyle?.enterSoundId || resolvedFromStyle?.perWordSoundId
      ? 'inherits from style'
      : 'none'

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : (stopPreview(), setOpen(false)))}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
            customSfx={customSfx}
            projectId={projectId}
            onPlay={playPreview}
            onStop={stopPreview}
            onPick={(id) => setSlot('enter', id)}
            onVolume={(v) => setVolume('enter', v)}
            onCustomSfxChange={onCustomSfxChange}
          />
          <SlotPicker
            slot="perWord"
            label="Per-word cue"
            currentId={draft.perWordSoundId}
            currentVolume={draft.perWordVolume ?? 0.4}
            preview={preview}
            customSfx={customSfx}
            projectId={projectId}
            onPlay={playPreview}
            onStop={stopPreview}
            onPick={(id) => setSlot('perWord', id)}
            onVolume={(v) => setVolume('perWord', v)}
            onCustomSfxChange={onCustomSfxChange}
          />
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Current: <span className="font-medium text-foreground">{summary}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {override ? (
              <Button variant="outline" size="sm" onClick={clearOverride}>
                <RotateCcw />
                Use style default
              </Button>
            ) : null}
            {onApplyToAll ? (
              <Button
                variant="outline"
                size="sm"
                onClick={applyToAll}
                title="Áp dụng cùng cấu hình SFX cho mọi segment của project"
              >
                Apply to all segments
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
  customSfx,
  projectId,
  onPlay,
  onStop,
  onPick,
  onVolume,
  onCustomSfxChange,
}: {
  slot: Slot
  label: string
  currentId: string | undefined
  currentVolume: number
  preview: PreviewState
  customSfx: CustomSfxEntry[]
  projectId: string
  onPlay: (sfxId: string) => void
  onStop: () => void
  onPick: (sfxId: string | undefined) => void
  onVolume: (v: number) => void
  onCustomSfxChange: (next: CustomSfxEntry[]) => void
}) {
  const [tab, setTab] = useState<'builtin' | 'custom'>('builtin')
  const volumePct = Math.round(currentVolume * 100)

  // Snap the active tab to wherever the currently picked SFX lives — so
  // when the dialog opens with an existing override, the user lands on
  // the tab that contains it.
  useEffect(() => {
    if (currentId?.startsWith('user-')) setTab('custom')
  }, [currentId])

  // If the draft references a custom SFX entry that no longer exists
  // (e.g. user just deleted it from the bank), clear the slot so the
  // footer doesn't keep showing a dangling id and Apply can't save an
  // unresolvable override.
  useEffect(() => {
    if (!currentId?.startsWith('user-')) return
    if (customSfx.some((e) => e.id === currentId)) return
    onPick(undefined)
  }, [currentId, customSfx, onPick])

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

      <div className="flex gap-1 rounded-md border bg-secondary/20 p-0.5 text-xs">
        <TabButton active={tab === 'builtin'} onClick={() => setTab('builtin')}>
          Built-in ({BUILT_IN_SFX.length})
        </TabButton>
        <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
          Custom ({customSfx.length})
        </TabButton>
      </div>

      {tab === 'builtin' ? (
        // Cap the visible area so a long bank (built-in 12 + None, or a
        // future expansion) doesn't push the Apply / Cancel footer out
        // of view. Internal scroll keeps the dialog height predictable.
        <div className="max-h-64 overflow-y-auto rounded-md border bg-secondary/10 p-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {/* Explicit "None" tile so silencing this slot is a first-class
                choice in the grid — not a tiny text link in the header. */}
            <NoneTile
              selected={!currentId}
              onPick={() => {
                onStop()
                onPick(undefined)
              }}
            />
            {BUILT_IN_SFX.map((entry) => (
              <SfxTile
                key={entry.id}
                id={entry.id}
                label={entry.label}
                meta={`${entry.durationSec}s · ${entry.source}`}
                selected={currentId === entry.id}
                preview={preview}
                onPlay={onPlay}
                onStop={onStop}
                onPick={onPick}
              />
            ))}
          </div>
        </div>
      ) : (
        <CustomBank
          projectId={projectId}
          customSfx={customSfx}
          selected={currentId}
          preview={preview}
          onPlay={onPlay}
          onStop={onStop}
          onPick={onPick}
          onCustomSfxChange={onCustomSfxChange}
        />
      )}

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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function CustomBank({
  projectId,
  customSfx,
  selected,
  preview,
  onPlay,
  onStop,
  onPick,
  onCustomSfxChange,
}: {
  projectId: string
  customSfx: CustomSfxEntry[]
  selected: string | undefined
  preview: PreviewState
  onPlay: (sfxId: string) => void
  onStop: () => void
  // Accepts `undefined` so the None tile can clear the slot from this tab
  // without forcing the caller to switch back to Built-in.
  onPick: (sfxId: string | undefined) => void
  onCustomSfxChange: (next: CustomSfxEntry[]) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/sfx`, {
        method: 'POST',
        body: form,
      })
      const body = (await res.json()) as {
        entry?: CustomSfxEntry
        error?: string
        dedup?: boolean
      }
      if (!res.ok || !body.entry) {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // Avoid duplicating an entry the server reported as dedup.
      const existing = customSfx.find((e) => e.id === body.entry!.id)
      if (existing) {
        onCustomSfxChange(customSfx)
      } else {
        onCustomSfxChange([...customSfx, body.entry])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  const remove = async (slug: string) => {
    if (preview.sfxId === slug) onStop()
    setError(null)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/sfx?slug=${encodeURIComponent(slug)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      onCustomSfxChange(customSfx.filter((e) => e.id !== slug))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-2">
      <div
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border p-4 text-center transition-colors hover:border-primary hover:bg-secondary/40"
      >
        {uploading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="size-5 text-muted-foreground" />
        )}
        <p className="mt-2 text-xs font-medium">
          {uploading ? 'Uploading…' : 'Drop or click to upload mp3'}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          ≤ 500 KB · ≤ 5 s · stored in this project only
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,.mp3"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          e.target.value = ''
        }}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {customSfx.length === 0 && !uploading ? (
        <p className="text-xs text-muted-foreground">No custom cues yet.</p>
      ) : (
        // Same scroll wrapper as the built-in tab. Upload dropzone above
        // stays sticky in view so users can drop a new file even when the
        // bank already has many entries.
        <div className="max-h-64 overflow-y-auto rounded-md border bg-secondary/10 p-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {/* Mirror the None tile from the built-in tab so the user can
                silence this slot without switching tabs. */}
            <NoneTile
              selected={!selected}
              onPick={() => {
                onStop()
                onPick(undefined)
              }}
            />
            {customSfx.map((entry) => (
              <SfxTile
                key={entry.id}
                id={entry.id}
                label={entry.label}
                meta={`${entry.durationSec.toFixed(1)}s · user`}
                selected={selected === entry.id}
                preview={preview}
                onPlay={onPlay}
                onStop={onStop}
                onPick={onPick}
                onDelete={() => void remove(entry.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A grid tile that, when picked, clears the slot's sfxId — i.e. silences
 * this cue. Mirrors the visual weight of SfxTile so it reads as a
 * first-class option in the grid (not a "negative" outlier).
 */
function NoneTile({
  selected,
  onPick,
}: {
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'hover:border-muted-foreground/40 hover:bg-secondary/40'
      )}
      title="Silence this slot"
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <VolumeX className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">None</span>
        <span className="truncate text-[10px] text-muted-foreground">
          không phát âm
        </span>
      </span>
    </button>
  )
}

function SfxTile({
  id,
  label,
  meta,
  selected,
  preview,
  onPlay,
  onStop,
  onPick,
  onDelete,
}: {
  id: string
  label: string
  meta: string
  selected: boolean
  preview: PreviewState
  onPlay: (sfxId: string) => void
  onStop: () => void
  onPick: (sfxId: string) => void
  onDelete?: () => void
}) {
  const isLoading = preview.sfxId === id && preview.status === 'loading'
  const isPlaying = preview.sfxId === id && preview.status === 'playing'
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
          else onPlay(id)
        }}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-foreground"
        title={`Preview ${label}`}
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
        onClick={() => onPick(id)}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
        title={`Pick ${label}`}
      >
        <span className="truncate font-medium">{label}</span>
        <span className="truncate text-[10px] text-muted-foreground">{meta}</span>
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          title={`Delete ${label}`}
          aria-label={`Delete ${label}`}
        >
          <Trash2 className="size-3" />
        </button>
      ) : null}
    </div>
  )
}

// Re-export type so the original SfxEntry type stays available to other components.
export type { SfxEntry }
