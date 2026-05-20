'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type {
  Project,
  Thumbnail,
  ThumbnailLayout,
  ThumbnailTextStyle,
} from '@news-tok/shared/schema'
import {
  PLATFORM_SAFE_ZONES,
  SAFE_ZONE_COLORS,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  ThumbnailRenderer,
  UNIVERSAL_SAFE_ZONE,
  lintAgainstAllPlatforms,
  recipeForTopic,
} from '@news-tok/thumbnail'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  projectId: string
  initialProject: Project
}

const LAYOUTS: { id: ThumbnailLayout; label: string }[] = [
  { id: 'news-breaking', label: 'News breaking' },
  { id: 'news-weather', label: 'News weather' },
  { id: 'entertainment-bomb', label: 'Entertainment bomb' },
  { id: 'science-clean', label: 'Science clean' },
  { id: 'knowledge-bookish', label: 'Knowledge bookish' },
  { id: 'sports-hype', label: 'Sports hype' },
]

const PREVIEW_HEIGHT = 720
const PREVIEW_WIDTH = (PREVIEW_HEIGHT * THUMB_WIDTH) / THUMB_HEIGHT
const PREVIEW_SCALE = PREVIEW_HEIGHT / THUMB_HEIGHT

/**
 * Resolve an absolute disk path into a URL Studio can serve. We use
 * /api/asset?path=... which streams arbitrary paths (existing endpoint).
 */
function assetSrc(path: string): string {
  if (/^https?:|^data:|^blob:/i.test(path)) return path
  // The asset route accepts a `path` query param. Encode it so Windows
  // backslashes survive.
  return `/api/asset?path=${encodeURIComponent(path)}`
}

export function ThumbnailEditor({ projectId, initialProject }: Props) {
  const [project] = useState(initialProject)
  const [thumbnail, setThumbnail] = useState<Thumbnail | null>(initialProject.thumbnail ?? null)
  const [topic, setTopic] = useState<string>('generic')
  const [busy, setBusy] = useState<null | 'generate' | 'save' | 'reroll'>(null)
  const [showSafeZones, setShowSafeZones] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initial sync with API to get topic + safe zones in case the server
  // didn't hydrate them. Cheap GET, no render.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/thumbnail`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.topic) setTopic(data.topic)
        if (data?.thumbnail) setThumbnail(data.thumbnail as Thumbnail)
      })
      .catch(() => {
        /* non-fatal */
      })
  }, [projectId])

  const recipe = useMemo(() => recipeForTopic(topic), [topic])

  const onGenerate = useCallback(async () => {
    setBusy('generate')
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/thumbnail`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Failed to generate thumbnail')
      } else {
        setThumbnail(data.thumbnail as Thumbnail)
        if (data.topic) setTopic(data.topic)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }, [projectId])

  const onSave = useCallback(async () => {
    if (!thumbnail) return
    setBusy('save')
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/thumbnail`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thumbnail),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Failed to save thumbnail')
      } else {
        setThumbnail(data.thumbnail as Thumbnail)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }, [projectId, thumbnail])

  const onDelete = useCallback(async () => {
    if (!confirm('Remove the thumbnail from this project?')) return
    setBusy('save')
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/thumbnail`, { method: 'DELETE' })
      if (res.ok) setThumbnail(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }, [projectId])

  const onPickFrame = useCallback((path: string, atSec: number) => {
    setThumbnail((prev) =>
      prev
        ? {
            ...prev,
            background: { kind: 'random-frame', framePath: path, atSec },
          }
        : prev
    )
  }, [])

  const onLayoutChange = useCallback((nextLayout: ThumbnailLayout) => {
    setThumbnail((prev) => (prev ? { ...prev, layout: nextLayout } : prev))
  }, [])

  const onTextChange = useCallback(
    (field: 'title' | 'eyebrow' | 'accent', value: string) => {
      setThumbnail((prev) =>
        prev
          ? {
              ...prev,
              edits: {
                ...prev.edits,
                [field]: value || undefined,
                ...(field === 'title' ? { title: value } : {}),
              },
            }
          : prev
      )
    },
    []
  )

  const onTitleStyleChange = useCallback((patch: Partial<ThumbnailTextStyle>) => {
    setThumbnail((prev) =>
      prev
        ? { ...prev, edits: { ...prev.edits, titleStyle: { ...prev.edits.titleStyle, ...patch } } }
        : prev
    )
  }, [])

  const onEyebrowStyleChange = useCallback((patch: Partial<ThumbnailTextStyle>) => {
    setThumbnail((prev) => {
      if (!prev || !prev.edits.eyebrowStyle) return prev
      return {
        ...prev,
        edits: { ...prev.edits, eyebrowStyle: { ...prev.edits.eyebrowStyle, ...patch } },
      }
    })
  }, [])

  // Recompute lint warnings on every edit so the user sees them live.
  const liveWarnings = useMemo(() => {
    if (!thumbnail) return []
    const out: string[] = []
    const t = thumbnail.edits.titleStyle
    const titleLines = Math.max(
      1,
      Math.ceil(thumbnail.edits.title.length / Math.max(8, Math.floor(t.width / (t.fontSize * 0.55))))
    )
    const titleBbox = {
      x: t.x,
      y: t.y,
      width: t.width,
      height: Math.round(t.fontSize * t.lineHeight * Math.min(3, titleLines)),
    }
    out.push(...lintAgainstAllPlatforms(titleBbox, 'Title').warnings)
    if (thumbnail.edits.eyebrowStyle && thumbnail.edits.eyebrow) {
      const e = thumbnail.edits.eyebrowStyle
      const ebBbox = {
        x: e.x,
        y: e.y,
        width: e.width,
        height: Math.round(e.fontSize * e.lineHeight * 1.4),
      }
      out.push(...lintAgainstAllPlatforms(ebBbox, 'Eyebrow').warnings)
    }
    return out
  }, [thumbnail])

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href={`/projects/${projectId}`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to project
          </Link>
          <h1 className="text-2xl font-semibold">Thumbnail editor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Single 1080×1920 cover for TikTok / YT Shorts / FB Reels / IG Reels. Content inside the
            green safe zone reads on every platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSafeZones((v) => !v)}
            className="gap-2"
          >
            {showSafeZones ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showSafeZones ? 'Hide safe zones' : 'Show safe zones'}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onGenerate}
            disabled={busy !== null}
            className="gap-2"
          >
            {busy === 'generate' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {thumbnail ? 'Regenerate' : 'Generate'}
          </Button>
          {thumbnail ? (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={onSave}
                disabled={busy !== null}
                className="gap-2"
              >
                {busy === 'save' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Pencil className="size-4" />
                )}
                Save & re-render
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                disabled={busy !== null}
                className="gap-2"
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-7">
          <div
            className="relative mx-auto overflow-hidden rounded-lg border bg-zinc-950 shadow-xl"
            style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
          >
            {thumbnail ? (
              <div
                style={{
                  width: THUMB_WIDTH,
                  height: THUMB_HEIGHT,
                  transform: `scale(${PREVIEW_SCALE})`,
                  transformOrigin: 'top left',
                }}
              >
                <ThumbnailRenderer
                  layout={thumbnail.layout}
                  edits={thumbnail.edits}
                  background={thumbnail.background}
                  watermark={thumbnail.watermark}
                  recipe={recipe}
                  resolveImageSrc={assetSrc}
                />
                {showSafeZones ? <SafeZoneOverlay /> : null}
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center p-8 text-center">
                <div>
                  <Sparkles className="mx-auto mb-3 size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No thumbnail yet. Render the project first, then click <strong>Generate</strong>{' '}
                    to extract frames and lay out the cover image automatically.
                  </p>
                </div>
              </div>
            )}
          </div>

          {liveWarnings.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              <strong>Safe-zone lint:</strong>
              <ul className="mt-1 list-inside list-disc">
                {liveWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="col-span-5 space-y-6">
          {thumbnail ? (
            <>
              <FieldGroup title="Layout">
                <div className="grid grid-cols-2 gap-2">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => onLayoutChange(l.id)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-xs transition',
                        thumbnail.layout === l.id
                          ? 'border-primary bg-primary/10 font-medium'
                          : 'border-muted hover:border-primary/50'
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup title="Background frames">
                {thumbnail.candidateFrames.length > 0 ? (
                  <div className="grid grid-cols-5 gap-2">
                    {thumbnail.candidateFrames.map((f) => {
                      const isActive =
                        thumbnail.background.kind === 'random-frame' &&
                        thumbnail.background.framePath === f.path
                      return (
                        <button
                          key={f.path}
                          onClick={() => onPickFrame(f.path, f.atSec)}
                          className={cn(
                            'relative overflow-hidden rounded border-2 transition',
                            isActive ? 'border-primary' : 'border-transparent hover:border-primary/50'
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={assetSrc(f.path)}
                            alt={`Frame at ${f.atSec.toFixed(1)}s`}
                            className="aspect-[9/16] w-full object-cover"
                          />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center text-[10px] text-white">
                            {f.atSec.toFixed(1)}s
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No candidate frames yet — click Generate to extract them from output.mp4.
                  </p>
                )}
                <button
                  onClick={onGenerate}
                  disabled={busy !== null}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="size-3" />
                  Re-extract frames
                </button>
              </FieldGroup>

              <FieldGroup title="Headline">
                <textarea
                  value={thumbnail.edits.title}
                  onChange={(e) => onTextChange('title', e.target.value)}
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <NumberField
                    label="X"
                    value={thumbnail.edits.titleStyle.x}
                    onChange={(v) => onTitleStyleChange({ x: v })}
                    min={0}
                    max={THUMB_WIDTH}
                  />
                  <NumberField
                    label="Y"
                    value={thumbnail.edits.titleStyle.y}
                    onChange={(v) => onTitleStyleChange({ y: v })}
                    min={0}
                    max={THUMB_HEIGHT}
                  />
                  <NumberField
                    label="Width"
                    value={thumbnail.edits.titleStyle.width}
                    onChange={(v) => onTitleStyleChange({ width: v })}
                    min={200}
                    max={THUMB_WIDTH}
                  />
                  <NumberField
                    label="Font size"
                    value={thumbnail.edits.titleStyle.fontSize}
                    onChange={(v) => onTitleStyleChange({ fontSize: v })}
                    min={24}
                    max={200}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Safe band: y between {UNIVERSAL_SAFE_ZONE.y} and{' '}
                  {UNIVERSAL_SAFE_ZONE.y + UNIVERSAL_SAFE_ZONE.height}.
                </p>
              </FieldGroup>

              {thumbnail.edits.eyebrowStyle ? (
                <FieldGroup title="Eyebrow chip">
                  <input
                    type="text"
                    value={thumbnail.edits.eyebrow ?? ''}
                    onChange={(e) => onTextChange('eyebrow', e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <NumberField
                      label="X"
                      value={thumbnail.edits.eyebrowStyle.x}
                      onChange={(v) => onEyebrowStyleChange({ x: v })}
                      min={0}
                      max={THUMB_WIDTH}
                    />
                    <NumberField
                      label="Y"
                      value={thumbnail.edits.eyebrowStyle.y}
                      onChange={(v) => onEyebrowStyleChange({ y: v })}
                      min={0}
                      max={THUMB_HEIGHT}
                    />
                  </div>
                </FieldGroup>
              ) : null}

              <FieldGroup title="Accent phrase">
                <input
                  type="text"
                  value={thumbnail.edits.accent ?? ''}
                  onChange={(e) => onTextChange('accent', e.target.value)}
                  placeholder="Substring of the headline to highlight"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  The matching substring gets the layout&apos;s accent treatment (red plate for news,
                  yellow fill for sports, colour-only for science / knowledge).
                </p>
              </FieldGroup>

              <FieldGroup title="Path">
                <code className="break-all text-xs">{thumbnail.path ?? '(not rendered yet)'}</code>
              </FieldGroup>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No thumbnail config yet. The project must have a rendered output.mp4 before
              generation.
            </p>
          )}
        </aside>
      </div>
    </main>
  )
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        className="rounded border bg-background px-2 py-1 text-sm"
      />
    </label>
  )
}

/**
 * Paint the platform unsafe rects + universal safe zone outline on top
 * of the rendered thumbnail. Coordinates are in 1080x1920 space; the
 * parent applies the preview transform so we don't need to scale here.
 */
function SafeZoneOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Universal safe-zone outline (green). */}
      <div
        style={{
          position: 'absolute',
          left: UNIVERSAL_SAFE_ZONE.x,
          top: UNIVERSAL_SAFE_ZONE.y,
          width: UNIVERSAL_SAFE_ZONE.width,
          height: UNIVERSAL_SAFE_ZONE.height,
          border: `4px dashed ${SAFE_ZONE_COLORS.outline.universal}`,
          background: SAFE_ZONE_COLORS.universal,
        }}
      />
      {/* Per-platform unsafe rects (red wash). */}
      {Object.values(PLATFORM_SAFE_ZONES).flatMap((p) =>
        p.unsafe.map((r, i) => (
          <div
            key={`${p.platform}-${i}`}
            style={{
              position: 'absolute',
              left: r.x,
              top: r.y,
              width: r.width,
              height: r.height,
              background: SAFE_ZONE_COLORS.unsafe,
            }}
          />
        ))
      )}
    </div>
  )
}
