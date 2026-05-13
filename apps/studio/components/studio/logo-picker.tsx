'use client'

import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, Trash2, Type, Upload } from 'lucide-react'
import type { Aspect, LogoMarker } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { previewFontStack } from '@/lib/text-style-preview'
import { cn } from '@/lib/utils'
import { DeviceMockupPreview, splitRatioFor } from './device-mockup-preview'

type Tab = 'image' | 'text'
type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const POSITIONS: { id: Position; label: string }[] = [
  { id: 'top-left', label: 'TL' },
  { id: 'top-right', label: 'TR' },
  { id: 'bottom-left', label: 'BL' },
  { id: 'bottom-right', label: 'BR' },
]

const DEFAULT_PLACEMENT = {
  position: 'top-right' as Position,
  marginPct: 5,
  opacity: 0.85,
  appliesTo: 'all' as 'all' | 'intro-outro-only',
}

/**
 * Project-level watermark editor. Split-pane:
 *   - Left:  Image / Text tabs + placement controls.
 *   - Right: DeviceMockupPreview showing the watermark in the chosen
 *            corner over the segment background, so the user sees what
 *            ships before clicking Apply.
 *
 * The dialog edits a draft and only commits via Apply, so users can
 * preview placement adjustments without dirtying the project until
 * they're happy.
 */
export function LogoPicker({
  projectId,
  logo,
  onChange,
  trigger,
  aspect = '9:16',
  previewBackground,
}: {
  projectId: string
  logo: LogoMarker
  onChange: (next: LogoMarker) => void
  trigger: React.ReactNode
  /** Project aspect — picks the device frame on the right. */
  aspect?: Aspect
  /** Optional segment background path so the preview sits over the real scene. */
  previewBackground?: string
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(logo.kind === 'text' ? 'text' : 'image')
  const [draft, setDraft] = useState<LogoMarker>(logo)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset draft + tab each time the dialog opens so a previous abandoned
  // edit doesn't leak in.
  useEffect(() => {
    if (!open) return
    setDraft(logo)
    setTab(logo.kind === 'text' ? 'text' : 'image')
    setError(null)
  }, [open, logo])

  const placement =
    draft.kind === 'none'
      ? DEFAULT_PLACEMENT
      : {
          position: draft.position,
          marginPct: draft.marginPct,
          opacity: draft.opacity,
          appliesTo: draft.appliesTo,
        }

  const setPlacement = (patch: Partial<typeof placement>) => {
    setDraft((d) => {
      if (d.kind === 'none') {
        // None has no placement — promote to a text draft with the new
        // controls so the user can keep tweaking before picking a kind.
        return {
          kind: 'text',
          text: '@username',
          fontId: 'inter',
          sizePct: 2.2,
          color: '#ffffff',
          ...DEFAULT_PLACEMENT,
          ...patch,
        }
      }
      return { ...d, ...patch }
    })
  }

  const upload = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/logo`, {
        method: 'POST',
        body: form,
      })
      const body = (await res.json()) as { logo?: LogoMarker; error?: string }
      if (!res.ok || !body.logo) throw new Error(body.error ?? `HTTP ${res.status}`)
      setDraft(body.logo)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  const removeImage = async () => {
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/logo`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setDraft({ kind: 'none' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const switchToText = () => {
    setTab('text')
    if (draft.kind !== 'text') {
      setDraft({
        kind: 'text',
        text: '@username',
        fontId: 'inter',
        sizePct: 2.2,
        color: '#ffffff',
        ...(draft.kind === 'none'
          ? DEFAULT_PLACEMENT
          : {
              position: draft.position,
              marginPct: draft.marginPct,
              opacity: draft.opacity,
              appliesTo: draft.appliesTo,
            }),
      })
    }
  }

  const switchToImage = () => {
    setTab('image')
    // Don't auto-promote the draft — the image tab needs a real upload.
    // If the user previously had an image entry, switching back surfaces it.
    if (logo.kind === 'image') setDraft(logo)
  }

  const apply = () => {
    onChange(draft)
    setOpen(false)
  }

  const split = splitRatioFor(aspect)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="grid max-h-[92vh] w-full max-w-5xl grid-rows-[auto_1fr_auto] gap-0 overflow-hidden p-0"
        // Radix auto-focuses the first focusable child, which would land
        // on the Image tab button even when Text is the active tab — making
        // it look like the wrong tab is selected. Defer that initial focus
        // until React has settled the tab state, then move it to whichever
        // tab is actually active.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          requestAnimationFrame(() => {
            const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
            const buttons = dialog?.querySelectorAll<HTMLButtonElement>('button') ?? []
            const active = Array.from(buttons).find((b) =>
              b.className.includes('bg-background')
            )
            active?.focus()
          })
        }}
      >
        {/* Header */}
        <div className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="size-5" />
            Watermark
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Add a logo or text watermark on top of every segment. Default
            position is top-right — avoids TikTok's bottom-right share
            buttons and the subtitle area.
          </DialogDescription>
        </div>

        {/* Split body */}
        <div
          className="grid min-h-0 overflow-hidden"
          style={{ gridTemplateColumns: `${split.left} ${split.right}` }}
        >
          {/* Left: tabs + form */}
          <div className="flex min-h-0 flex-col overflow-hidden border-r">
            <div className="border-b px-3 py-2">
              <div className="flex gap-1 rounded-md border bg-secondary/20 p-0.5 text-xs">
                <TabButton active={tab === 'image'} onClick={switchToImage}>
                  <ImageIcon className="size-3.5" />
                  Image
                </TabButton>
                <TabButton active={tab === 'text'} onClick={switchToText}>
                  <Type className="size-3.5" />
                  Text
                </TabButton>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
              {tab === 'image' ? (
                <ImageTab
                  draft={draft}
                  uploading={uploading}
                  inputRef={inputRef}
                  onUpload={upload}
                  onRemove={removeImage}
                  onSize={(v) =>
                    setDraft((d) =>
                      d.kind === 'image' ? { ...d, sizePct: v } : d
                    )
                  }
                />
              ) : (
                <TextTab
                  draft={draft}
                  onPatch={(patch) =>
                    setDraft((d) => {
                      const base =
                        d.kind === 'text'
                          ? d
                          : {
                              kind: 'text' as const,
                              text: '@username',
                              fontId: 'inter',
                              sizePct: 2.2,
                              color: '#ffffff',
                              ...DEFAULT_PLACEMENT,
                            }
                      return { ...base, ...patch }
                    })
                  }
                />
              )}

              <PlacementControls placement={placement} onPatch={setPlacement} />
            </div>
          </div>

          {/* Right: device mockup with watermark overlay */}
          <div className="flex min-h-0 items-center justify-center overflow-y-auto bg-secondary/20 p-4">
            <DeviceMockupPreview
              aspect={aspect}
              background={previewBackground}
              label="Watermark preview"
            >
              <WatermarkOverlay draft={draft} />
            </DeviceMockupPreview>
          </div>
        </div>

        {/* Footer */}
        {error ? (
          <p className="border-t bg-destructive/5 px-4 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        <div className="flex items-center justify-between gap-2 border-t bg-background px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {draft.kind === 'none'
              ? 'No watermark'
              : draft.kind === 'image'
                ? 'Image watermark'
                : `Text · "${draft.text}"`}
          </div>
          <div className="flex items-center gap-2">
            {draft.kind !== 'none' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft({ kind: 'none' })}
              >
                <Trash2 />
                Remove
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
        'flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function ImageTab({
  draft,
  uploading,
  inputRef,
  onUpload,
  onRemove,
  onSize,
}: {
  draft: LogoMarker
  uploading: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onUpload: (file: File) => void
  onRemove: () => void
  onSize: (v: number) => void
}) {
  const isImage = draft.kind === 'image'
  return (
    <div className="space-y-3">
      {isImage ? (
        <div className="flex items-center gap-3 rounded-md border bg-secondary/20 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/projects/${encodeURIComponent(draftProjectIdFromImage(draft))}/logo/file?v=${encodeURIComponent(draft.path)}`}
            alt={draft.originalName ?? 'watermark'}
            className="max-h-16 rounded border bg-card object-contain"
          />
          <div className="flex-1 text-xs">
            <div className="font-medium">{draft.originalName ?? 'logo'}</div>
            <div className="text-muted-foreground">
              {draft.width && draft.height ? `${draft.width}×${draft.height}` : 'image'}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload />
            Replace
          </Button>
          <Button variant="outline" size="sm" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary hover:bg-secondary/40"
        >
          {uploading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="size-6 text-muted-foreground" />
          )}
          <p className="mt-2 text-xs font-medium">
            {uploading ? 'Uploading…' : 'Drop or click to upload logo'}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            PNG / JPG / WebP / SVG · ≤ 2 MB
          </p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
          e.target.value = ''
        }}
      />

      {isImage ? (
        <div className="flex items-center gap-3 rounded-md border bg-secondary/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Size</span>
          <input
            type="range"
            min={5}
            max={25}
            step={1}
            value={draft.sizePct}
            onChange={(e) => onSize(Number.parseInt(e.target.value, 10))}
            className="h-2 flex-1 cursor-pointer accent-primary"
          />
          <span className="w-12 text-right tabular-nums text-muted-foreground">
            {draft.sizePct}%
          </span>
        </div>
      ) : null}
    </div>
  )
}

function TextTab({
  draft,
  onPatch,
}: {
  draft: LogoMarker
  onPatch: (patch: Partial<Extract<LogoMarker, { kind: 'text' }>>) => void
}) {
  const isText = draft.kind === 'text'
  const text = isText ? draft.text : '@username'
  const sizePct = isText ? draft.sizePct : 2.2
  const color = isText ? draft.color : '#ffffff'
  const hasBg = isText && !!draft.background
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide">Watermark text</Label>
        <input
          type="text"
          value={text}
          maxLength={40}
          onChange={(e) => onPatch({ text: e.target.value })}
          placeholder="@username or © News-Tok"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide">Colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => onPatch({ color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded border"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => onPatch({ color: e.target.value })}
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide">Size</Label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={6}
              step={0.1}
              value={sizePct}
              onChange={(e) => onPatch({ sizePct: Number.parseFloat(e.target.value) })}
              className="h-2 flex-1 cursor-pointer accent-primary"
            />
            <span className="w-12 text-right tabular-nums text-xs text-muted-foreground">
              {sizePct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-md border bg-secondary/20 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={hasBg}
            onChange={(e) =>
              onPatch(
                e.target.checked
                  ? {
                      background: {
                        color: 'rgba(0,0,0,0.45)',
                        paddingPx: 10,
                        radiusPx: 6,
                      },
                    }
                  : { background: undefined }
              )
            }
            className="size-3.5 cursor-pointer accent-primary"
          />
          Dark plate behind text (helps on bright backgrounds)
        </label>
      </div>
    </div>
  )
}

function PlacementControls({
  placement,
  onPatch,
}: {
  placement: {
    position: Position
    marginPct: number
    opacity: number
    appliesTo: 'all' | 'intro-outro-only'
  }
  onPatch: (patch: Partial<typeof placement>) => void
}) {
  return (
    <div className="space-y-3 rounded-md border bg-secondary/10 p-3">
      <div>
        <Label className="text-xs uppercase tracking-wide">Position</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {POSITIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPatch({ position: p.id })}
              className={cn(
                'relative flex h-16 items-center justify-center rounded-md border text-[10px] uppercase tracking-wide transition-colors',
                placement.position === p.id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'hover:border-muted-foreground/40 hover:bg-secondary/40'
              )}
              title={p.id}
            >
              <CornerDot position={p.id} active={placement.position === p.id} />
              <span className="ml-1">{p.id.replace('-', ' · ')}</span>
              {p.id === 'top-right' ? (
                <span className="absolute -top-2 right-2 rounded-full bg-primary px-1.5 py-0.5 text-[8px] text-primary-foreground">
                  REC
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide">Margin</Label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={15}
              step={1}
              value={placement.marginPct}
              onChange={(e) =>
                onPatch({ marginPct: Number.parseInt(e.target.value, 10) })
              }
              className="h-2 flex-1 cursor-pointer accent-primary"
            />
            <span className="w-10 text-right tabular-nums text-xs text-muted-foreground">
              {placement.marginPct}%
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide">Opacity</Label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(placement.opacity * 100)}
              onChange={(e) =>
                onPatch({ opacity: Number.parseInt(e.target.value, 10) / 100 })
              }
              className="h-2 flex-1 cursor-pointer accent-primary"
            />
            <span className="w-10 text-right tabular-nums text-xs text-muted-foreground">
              {Math.round(placement.opacity * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide">Applies to</Label>
        <select
          value={placement.appliesTo}
          onChange={(e) => onPatch({ appliesTo: e.target.value as typeof placement.appliesTo })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:light_dark]"
        >
          <option value="all" className="bg-background text-foreground">
            Every segment
          </option>
          <option value="intro-outro-only" className="bg-background text-foreground">
            Only intro and outro
          </option>
        </select>
      </div>
    </div>
  )
}

function CornerDot({ position, active }: { position: Position; active: boolean }) {
  const isTop = position.startsWith('top')
  const isLeft = position.endsWith('left')
  return (
    <span
      className={cn(
        'absolute size-2 rounded-full',
        active ? 'bg-primary' : 'bg-muted-foreground/50',
        isTop ? 'top-1.5' : 'bottom-1.5',
        isLeft ? 'left-1.5' : 'right-1.5'
      )}
    />
  )
}

// The image draft holds the absolute path on disk; we just need a way
// to derive the project id so the preview <img> can hit the right
// endpoint. The path always lives under data/projects/<id>/logo.<ext>,
// so the second-to-last path segment is the project id.
function draftProjectIdFromImage(draft: LogoMarker): string {
  if (draft.kind !== 'image') return ''
  const norm = draft.path.replace(/\\/g, '/')
  const parts = norm.split('/')
  // .../data/projects/<id>/logo.<ext>
  return parts[parts.length - 2] ?? ''
}

/**
 * Render the watermark inside the DeviceMockupPreview content slot, in
 * the corner the user chose. Absolute positioning + the four corner
 * variants from `placement.position` mirrors how the Remotion scene
 * places it at render time.
 */
function WatermarkOverlay({ draft }: { draft: LogoMarker }) {
  if (draft.kind === 'none') {
    return (
      <span className="text-xs text-white/60">No watermark — preview is blank</span>
    )
  }
  const position = draft.position
  const marginPct = draft.marginPct
  const opacity = draft.opacity
  const isTop = position.startsWith('top')
  const isLeft = position.endsWith('left')
  const cornerStyle: React.CSSProperties = {
    position: 'absolute',
    [isTop ? 'top' : 'bottom']: `${marginPct}%`,
    [isLeft ? 'left' : 'right']: `${marginPct}%`,
    opacity,
    // Sit above the preview's flex centring container.
    zIndex: 5,
  }

  if (draft.kind === 'image') {
    const src = `/api/projects/${encodeURIComponent(draftProjectIdFromImage(draft))}/logo/file?v=${encodeURIComponent(draft.path)}`
    // Translate sizePct (% of canvas width, which is the project frame
    // width) into a fraction of the mockup width. The preview content
    // slot is `absolute inset-0` so width:`${sizePct}%` reads off that
    // same box — matching the render output.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={draft.originalName ?? 'watermark'}
        style={{ ...cornerStyle, width: `${draft.sizePct}%`, height: 'auto' }}
      />
    )
  }

  // Text watermark — size is % of canvas width too. Convert to a font
  // size by treating the mockup inner width as 100 and scaling roughly
  // 0.6× so visuals match the rendered output (Remotion uses
  // canvas-width × sizePct for the font-size).
  const bgStyle: React.CSSProperties | undefined = draft.background
    ? {
        backgroundColor: draft.background.color,
        padding: draft.background.paddingPx ? `${draft.background.paddingPx * 0.4}px` : undefined,
        borderRadius: draft.background.radiusPx
          ? `${draft.background.radiusPx * 0.5}px`
          : undefined,
      }
    : undefined
  return (
    <span
      style={{
        ...cornerStyle,
        ...bgStyle,
        color: draft.color,
        fontFamily: previewFontStack(draft.fontId),
        fontWeight: 600,
        fontSize: `${draft.sizePct * 4}px`,
        whiteSpace: 'nowrap',
        textShadow: draft.background ? undefined : '0 1px 2px rgba(0,0,0,0.45)',
      }}
    >
      {draft.text}
    </span>
  )
}

