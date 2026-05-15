'use client'

import { useMemo, useRef, useState } from 'react'
import {
  FolderUp,
  ImageOff,
  Layers,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import type { AssetRef } from '@news-tok/shared/schema'
import { assetUrl } from '@/lib/asset-url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Per-project image library — a "media bin" the user fills once by
 * dragging a folder, then taps to apply any image as the current
 * segment background. Inspired by the same panel CapCut / Premiere /
 * Descript ship for short-form video, scoped down for the news-tok
 * inspector width.
 *
 * Storage and persistence live in the API layer; this component only
 * orchestrates the upload form-data, surfaces a thumbnail grid, and
 * fires the parent callbacks (`onApplyToCurrent`, `onApplyToAll`).
 */
export function ImageLibrary({
  projectId,
  library,
  onLibraryChange,
  onApplyToCurrent,
  onEditAndApply,
  onAutoFillEmpty,
  emptySegmentCount,
  hasSelectedSegment,
}: {
  projectId: string
  library: AssetRef[]
  /** Called with the server's authoritative library list after every mutation. */
  onLibraryChange: (next: AssetRef[]) => void
  /** Apply one image to the segment currently selected in the editor. */
  onApplyToCurrent: (asset: AssetRef) => void
  /**
   * Open the image editor seeded with this library asset. The parent
   * is responsible for stitching the chosen edits + asset onto the
   * selected segment when the editor closes (so the editor + library
   * use the same single dialog instance).
   */
  onEditAndApply?: (asset: AssetRef) => void
  /**
   * Apply the first N library images to segments missing a background.
   * Returns how many segments were filled so we can show a confirmation.
   */
  onAutoFillEmpty: (assets: AssetRef[]) => number
  /** How many segments still have no background image. Drives the auto-fill button. */
  emptySegmentCount: number
  /** When false, click-to-apply silently no-ops (no segment selected). */
  hasSelectedSegment: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return library
    return library.filter((a) => {
      const name = a.source?.attribution || a.source?.id || a.path
      return name.toLowerCase().includes(q)
    })
  }, [library, query])

  /**
   * Walk a dropped DataTransferItem (browser-only API). When the user
   * drops a folder, `webkitGetAsEntry()` exposes a tree we can recurse
   * into — without it, drop receives only the folder name as a
   * 0-byte `File`. We cap at one level deep so a stray Pictures-root
   * drop doesn't grind the browser.
   */
  const collectFromItems = async (items: DataTransferItemList): Promise<File[]> => {
    const out: File[] = []
    const entries: FileSystemEntry[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item) continue
      // Some browsers prefix this with `webkit`; most use the standard name.
      const entry = (item as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntry | null
        getAsEntry?: () => FileSystemEntry | null
      })
      const got = entry.getAsEntry?.() ?? entry.webkitGetAsEntry?.()
      if (got) entries.push(got)
      else {
        const f = item.getAsFile?.()
        if (f) out.push(f)
      }
    }

    const readDir = (dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> =>
      new Promise((res) => {
        const reader = dir.createReader()
        const all: FileSystemEntry[] = []
        const tick = () => {
          reader.readEntries((batch) => {
            if (batch.length === 0) return res(all)
            all.push(...batch)
            tick()
          })
        }
        tick()
      })

    const readFile = (e: FileSystemFileEntry): Promise<File> =>
      new Promise((res, rej) => e.file(res, rej))

    for (const e of entries) {
      if (e.isFile) {
        try {
          out.push(await readFile(e as FileSystemFileEntry))
        } catch {
          // skip unreadable entries — usually permission errors on macOS
        }
      } else if (e.isDirectory) {
        const children = await readDir(e as FileSystemDirectoryEntry)
        for (const c of children) {
          if (c.isFile) {
            try {
              out.push(await readFile(c as FileSystemFileEntry))
            } catch {
              /* skip */
            }
          }
          // Stop at one level deep on purpose — see component comment.
        }
      }
    }
    return out
  }

  const upload = async (files: File[]) => {
    if (files.length === 0) return
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) {
      setError('No image files in your selection (JPG / PNG / WebP / GIF).')
      setTimeout(() => setError(null), 4000)
      return
    }
    setError(null)
    setFeedback(null)
    setUploading(true)
    try {
      const form = new FormData()
      for (const f of images) form.append('file', f)
      const res = await fetch(`/api/projects/${projectId}/library`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const body = (await res.json()) as {
        added: AssetRef[]
        skipped: { name: string; reason: string }[]
        library: AssetRef[]
      }
      onLibraryChange(body.library)
      const dupes = body.skipped.filter((s) => s.reason === 'already in library').length
      const parts: string[] = []
      if (body.added.length > 0) parts.push(`+${body.added.length} added`)
      if (dupes > 0) parts.push(`${dupes} dupes skipped`)
      const otherSkips = body.skipped.length - dupes
      if (otherSkips > 0) parts.push(`${otherSkips} ignored`)
      setFeedback(parts.join(' · ') || 'Nothing to add')
      setTimeout(() => setFeedback(null), 3500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  const removeOne = async (asset: AssetRef) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/library`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: asset.path }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const body = (await res.json()) as { library: AssetRef[] }
      onLibraryChange(body.library)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setTimeout(() => setError(null), 4000)
    }
  }

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const files = e.dataTransfer.items
      ? await collectFromItems(e.dataTransfer.items)
      : Array.from(e.dataTransfer.files ?? [])
    void upload(files)
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    void upload(files)
    // Allow re-picking the same file later.
    e.target.value = ''
  }

  const isEmpty = library.length === 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Layers className="size-3.5" />
          Library
          {library.length > 0 ? (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-foreground">
              {library.length}
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Pick one or more image files (Ctrl-click to multi-select)"
            className="h-7 px-2 text-xs"
          >
            {uploading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            Add
          </Button>
        </div>
      </div>

      {/* Dropzone — small footprint when empty (full callout) and a thin
          drop-target band when populated, so the grid stays the focal
          point once images exist. */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragging) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={isEmpty ? () => fileInputRef.current?.click() : undefined}
        className={cn(
          'rounded-md border-2 border-dashed text-center transition-colors',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border',
          isEmpty
            ? 'cursor-pointer p-4 hover:border-primary hover:bg-secondary/40'
            : 'p-2'
        )}
      >
        {isEmpty ? (
          <div className="flex flex-col items-center gap-1.5">
            <FolderUp className="size-7 text-muted-foreground" />
            <p className="text-xs font-medium">Drop a folder of images</p>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Bulk-import once, then click any thumbnail to use it as a
              segment background. JPG / PNG / WebP / GIF.
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Drop more images here, or
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
              className="ml-1 text-primary underline-offset-2 hover:underline"
            >
              pick files
            </button>
          </p>
        )}
      </div>

      {/* Use a plain multi-file picker — Ctrl/Cmd-click in the OS dialog
          covers the cherry-pick case, and folder import works through
          the dropzone above (which walks dropped directories one level
          deep via webkitGetAsEntry). Mixing `webkitdirectory` on the
          picker would force folder-only mode on Chromium and break
          single-file selection. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />

      {/* Smart action: auto-fill empty segments. Hidden when there's
          nothing to do (no library or no empties). */}
      {library.length > 0 && emptySegmentCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          onClick={() => {
            const filled = onAutoFillEmpty(library)
            setFeedback(`Filled ${filled} empty ${filled === 1 ? 'segment' : 'segments'}`)
            setTimeout(() => setFeedback(null), 2500)
          }}
          title={`Apply the first ${Math.min(library.length, emptySegmentCount)} library images to segments without a background`}
        >
          <Sparkles className="size-3.5" />
          Auto-fill {emptySegmentCount} empty
        </Button>
      ) : null}

      {library.length > 4 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search filename"
            className="h-7 pl-7 text-xs"
            aria-label="Search image library"
          />
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="grid grid-cols-4 gap-1.5">
          {filtered.map((asset) => {
            const url = assetUrl(asset.path)
            const name = asset.source?.attribution || asset.source?.id || ''
            return (
              <div key={asset.path} className="group relative">
                <button
                  type="button"
                  onClick={() => onApplyToCurrent(asset)}
                  disabled={!hasSelectedSegment}
                  className={cn(
                    'block aspect-square w-full overflow-hidden rounded border bg-muted transition-all',
                    hasSelectedSegment
                      ? 'cursor-pointer hover:ring-2 hover:ring-primary'
                      : 'cursor-not-allowed opacity-50'
                  )}
                  title={
                    hasSelectedSegment
                      ? `Apply "${name}" to current segment`
                      : 'Select a segment first to apply'
                  }
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={name}
                      loading="lazy"
                      className="block h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="size-4 text-muted-foreground" />
                    </div>
                  )}
                </button>
                {onEditAndApply && hasSelectedSegment ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditAndApply(asset)
                    }}
                    className="absolute left-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-primary group-hover:opacity-100"
                    aria-label={`Edit and apply ${name}`}
                    title="Crop / rotate / overlay, then apply to current segment"
                  >
                    <Pencil className="size-3" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeOne(asset)
                  }}
                  className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                  aria-label={`Remove ${name} from library`}
                  title="Remove from library"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            )
          })}
        </div>
      ) : library.length > 0 ? (
        <p className="px-1 py-2 text-center text-[10px] text-muted-foreground">
          No matches for &quot;{query}&quot;
        </p>
      ) : null}

      {feedback ? (
        <p className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-700 dark:text-emerald-300">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="rounded bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
