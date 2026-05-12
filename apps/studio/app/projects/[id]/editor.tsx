'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Captions,
  CaptionsOff,
  Film,
  Image as ImageIcon,
  Languages,
  Layers,
  Loader2,
  Mic,
  Music,
  PlayCircle,
  RefreshCw,
  Save,
  Type,
  Volume2,
} from 'lucide-react'
import {
  DEFAULT_VOICES,
  type AssetRef,
  type Project,
  type Segment,
} from '@news-tok/shared/schema'
import { findTextStyle } from '@news-tok/shared/text-styles'
import { recommendSegmentDurationSec } from '@news-tok/shared/sanitize'
import { PlayerPane } from '@/components/studio/player-pane'
import { VariantsPanel } from '@/components/studio/variants-panel'
import { VoicePicker } from '@/components/studio/voice-picker'
import { ImagePicker } from '@/components/studio/image-picker'
import { MusicPicker } from '@/components/studio/music-picker'
import { StylePicker } from '@/components/studio/style-picker'
import { FontPicker } from '@/components/studio/font-picker'
import { assetUrl } from '@/lib/asset-url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'saving' | 'saved' | 'error'
type RenderStatus = 'idle' | 'running' | 'completed' | 'failed'

function projectSignature(p: Project): string {
  // Exclude `updatedAt` from dirty check — it changes on every patch.
  const { updatedAt: _ignored, ...rest } = p
  void _ignored
  return JSON.stringify(rest)
}

export function ProjectEditor({ initial }: { initial: Project }) {
  const [project, setProject] = useState<Project>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.segments[0]?.id ?? null
  )
  const [saveStatus, setSaveStatus] = useState<Status>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [renderStatus, setRenderStatus] = useState<RenderStatus>('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [lastSavedSig, setLastSavedSig] = useState<string>(() => projectSignature(initial))
  /** Which variant the in-browser preview is showing (null = default). */
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null)
  /** Which variant is currently rendering, if any. */
  const [renderingVariantId, setRenderingVariantId] = useState<string | null>(null)
  /** variantId → output mp4 absolute path from the latest render. */
  const [outputsByVariant, setOutputsByVariant] = useState<Record<string, string>>({})

  const currentSig = useMemo(() => projectSignature(project), [project])
  const isDirty = currentSig !== lastSavedSig

  const selected = project.segments.find((s) => s.id === selectedId) ?? null

  const updateSegment = useCallback(
    (id: string, patch: Partial<Segment>) => {
      setProject((p) => ({
        ...p,
        segments: p.segments.map((s) => {
          if (s.id !== id) return s
          const merged = { ...s, ...patch }
          // If the patch lands new narration audio, stretch the slot to
          // fit it so the next render does not cut the voice mid-word.
          // We respect the planned duration as a minimum — users may have
          // deliberately set the slot longer for a visual beat.
          const narrationSec = merged.audio?.narration?.durationSec ?? 0
          if (narrationSec > 0) {
            merged.durationSec = recommendSegmentDurationSec(
              narrationSec,
              merged.durationSec
            )
          }
          return merged
        }),
        updatedAt: new Date().toISOString(),
      }))
    },
    []
  )

  const updateProject = useCallback((patch: Partial<Project>) => {
    setProject((p) => ({ ...p, ...patch, updatedAt: new Date().toISOString() }))
  }, [])

  /**
   * Apply a textStyleId. Scope decides where the override is written:
   *
   *   - 'segmentInVariant' — writes to variant.textStyleBySegmentId[segId],
   *     so only this segment under this variant is affected. Other
   *     variants previewing the same segment keep their own look.
   *   - 'segment'          — writes to segment.textStyleId, applies across
   *                          every variant for this segment.
   *   - 'sceneKind'        — writes to segment.textStyleId for every
   *                          segment with the same scene kind.
   *   - 'all'              — writes to segment.textStyleId for every segment.
   */
  const applyStyle = useCallback(
    (input: {
      styleId: string
      scope: 'segmentInVariant' | 'segment' | 'sceneKind' | 'all'
      segmentId: string
      sceneKind?: string
      variantId?: string | null
    }) => {
      setProject((p) => {
        if (input.scope === 'segmentInVariant' && input.variantId) {
          const variants = (p.variants ?? []).map((v) => {
            if (v.id !== input.variantId) return v
            return {
              ...v,
              textStyleBySegmentId: {
                ...(v.textStyleBySegmentId ?? {}),
                [input.segmentId]: input.styleId,
              },
            }
          })
          return { ...p, variants, updatedAt: new Date().toISOString() }
        }
        const next = p.segments.map((s) => {
          if (input.scope === 'segment') {
            return s.id === input.segmentId ? { ...s, textStyleId: input.styleId } : s
          }
          if (input.scope === 'sceneKind') {
            return s.scene === input.sceneKind ? { ...s, textStyleId: input.styleId } : s
          }
          if (input.scope === 'all') {
            return { ...s, textStyleId: input.styleId }
          }
          return s
        })
        return { ...p, segments: next, updatedAt: new Date().toISOString() }
      })
    },
    []
  )

  /**
   * Apply a fontOverride id. Mirrors `applyStyle` scopes but writes to
   * `variant.fontOverrideBySegmentId` / `segment.fontOverride` rather
   * than the text-style fields, so font and style stay independent.
   */
  const applyFont = useCallback(
    (input: {
      fontId: string
      scope: 'segmentInVariant' | 'segment' | 'all'
      segmentId: string
      variantId?: string | null
    }) => {
      setProject((p) => {
        if (input.scope === 'segmentInVariant' && input.variantId) {
          const variants = (p.variants ?? []).map((v) => {
            if (v.id !== input.variantId) return v
            return {
              ...v,
              fontOverrideBySegmentId: {
                ...(v.fontOverrideBySegmentId ?? {}),
                [input.segmentId]: input.fontId,
              },
            }
          })
          return { ...p, variants, updatedAt: new Date().toISOString() }
        }
        const next = p.segments.map((s) => {
          if (input.scope === 'segment') {
            return s.id === input.segmentId ? { ...s, fontOverride: input.fontId } : s
          }
          if (input.scope === 'all') {
            return { ...s, fontOverride: input.fontId }
          }
          return s
        })
        return { ...p, segments: next, updatedAt: new Date().toISOString() }
      })
    },
    []
  )

  const save = useCallback(async () => {
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const saved = (await res.json()) as Project
      setProject(saved)
      setLastSavedSig(projectSignature(saved))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1200)
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }, [project])

  const triggerRender = useCallback(
    async (variant?: string) => {
      setRenderStatus('running')
      setRenderProgress(0)
      setRenderError(null)
      setRenderingVariantId(variant && variant !== 'all' ? variant : null)
      try {
        const qs = new URLSearchParams({ scope: 'full' })
        if (variant) qs.set('variant', variant)
        const res = await fetch(`/api/projects/${project.id}/render?${qs}`, {
          method: 'POST',
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
      } catch (err) {
        setRenderStatus('failed')
        setRenderError(err instanceof Error ? err.message : String(err))
        setRenderingVariantId(null)
      }
    },
    [project.id]
  )

  useEffect(() => {
    if (!isDirty) return
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (renderStatus !== 'running') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/render`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const job = (await res.json()) as {
          status: RenderStatus
          progress: number
          error?: string
          outputPath?: string
          outputPaths?: string[]
        }
        setRenderProgress(job.progress)
        if (job.status === 'completed') {
          setRenderStatus('completed')
          // Map outputPaths back onto variant ids by parsing the file name.
          // The render pipeline writes `output-<variantId>.mp4`; legacy
          // single-renders write `output.mp4` which we file under '*'.
          if (job.outputPaths && job.outputPaths.length > 0) {
            setOutputsByVariant((prev) => {
              const next = { ...prev }
              for (const p of job.outputPaths!) {
                const match = /output-([A-Za-z0-9_-]+)\.mp4$/.exec(p)
                if (match) next[match[1]!] = p
                else next['*'] = p
              }
              return next
            })
          }
          setRenderingVariantId(null)
          setTimeout(() => setRenderStatus('idle'), 3000)
        } else if (job.status === 'failed') {
          setRenderStatus('failed')
          setRenderError(job.error ?? 'render failed')
          setRenderingVariantId(null)
        }
      } catch {
        // Network blip — try again on next tick.
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [renderStatus, project.id])

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-3">
        <Link
          href="/projects"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Projects
        </Link>
        <div className="min-w-0 flex-1 basis-[16rem]">
          <h1 className="truncate text-base font-semibold">{project.title}</h1>
          <p className="truncate whitespace-nowrap text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Film className="size-3" />
              {project.aspect}
            </span>
            {' · '}
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" />
              {project.segments.length} segments
            </span>
            {' · '}
            <span className="inline-flex items-center gap-1">
              <Languages className="size-3" />
              {project.language}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            value={project.exportPreset}
            onChange={(e) =>
              updateProject({ exportPreset: e.target.value as Project['exportPreset'] })
            }
            className="h-8 rounded-md border border-input bg-transparent px-3 text-xs font-medium [color-scheme:dark]"
            aria-label="Export preset"
          >
            <option value="standard" className="bg-background text-foreground">Standard (30fps)</option>
            <option value="tiktok" className="bg-background text-foreground">TikTok (60fps)</option>
            <option value="youtube-shorts" className="bg-background text-foreground">YouTube Shorts</option>
            <option value="reels" className="bg-background text-foreground">Reels</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              updateProject({
                subtitles: {
                  enabled: !project.subtitles.enabled,
                  bottomPct: project.subtitles.bottomPct,
                },
              })
            }
          >
            {project.subtitles.enabled ? <Captions /> : <CaptionsOff />}
            Subs {project.subtitles.enabled ? 'on' : 'off'}
          </Button>
          <MusicPicker
            defaultMood="calm"
            defaultDurationSec={project.segments.reduce((s, x) => s + x.durationSec, 0) || 30}
            onSelect={(asset) => updateProject({ bgMusic: asset })}
            trigger={
              <Button variant="outline" size="sm">
                <Music />
                {project.bgMusic ? 'Music' : 'Add music'}
              </Button>
            }
          />
          <label
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-xs font-medium"
            title={`Master volume for text-transition SFX (current: ${Math.round((project.sfxVolume ?? 0.7) * 100)}%)`}
          >
            <Volume2 className="size-3" />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round((project.sfxVolume ?? 0.7) * 100)}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10) / 100
                if (Number.isFinite(v)) updateProject({ sfxVolume: v })
              }}
              className="h-8 w-20 cursor-pointer accent-primary"
              aria-label="SFX master volume"
            />
            <span className="tabular-nums text-muted-foreground">
              {Math.round((project.sfxVolume ?? 0.7) * 100)}
            </span>
          </label>
          <Button
            variant={isDirty ? 'default' : 'outline'}
            size="sm"
            onClick={save}
            disabled={saveStatus === 'saving' || (!isDirty && saveStatus !== 'error')}
            title={
              isDirty
                ? 'Unsaved changes'
                : saveStatus === 'saved'
                  ? 'Saved'
                  : 'No changes'
            }
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <span className="relative inline-flex items-center">
                <Save />
                {isDirty ? (
                  <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-amber-400" />
                ) : null}
              </span>
            )}
            {saveStatus === 'saving'
              ? 'Saving…'
              : saveStatus === 'saved'
                ? 'Saved'
                : isDirty
                  ? 'Save*'
                  : 'Saved'}
          </Button>
          {project.variants && project.variants.length > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                onClick={() => triggerRender('all')}
                disabled={renderStatus === 'running' || project.segments.length === 0}
                title="Render every declared variant to output-<id>.mp4"
              >
                {renderStatus === 'running' && renderingVariantId == null ? (
                  <>
                    <Loader2 className="animate-spin" />
                    All… {Math.round(renderProgress * 100)}%
                  </>
                ) : (
                  <>
                    <PlayCircle />
                    Render all
                  </>
                )}
              </Button>
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value
                  if (v) triggerRender(v)
                  e.currentTarget.value = ''
                }}
                disabled={renderStatus === 'running' || project.segments.length === 0}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs font-medium [color-scheme:dark]"
                aria-label="Render single variant"
                title="Render one variant"
              >
                <option value="" className="bg-background text-foreground">
                  Render one…
                </option>
                {project.variants.map((v) => (
                  <option key={v.id} value={v.id} className="bg-background text-foreground">
                    {v.id} · {v.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => triggerRender()}
              disabled={renderStatus === 'running' || project.segments.length === 0}
            >
              {renderStatus === 'running' ? (
                <>
                  <Loader2 className="animate-spin" />
                  Rendering… {Math.round(renderProgress * 100)}%
                </>
              ) : (
                <>
                  <PlayCircle />
                  Render full
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      {(saveError || renderError) && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-xs text-destructive">
          {saveError ?? renderError}
        </div>
      )}

      {renderStatus === 'running' && (
        <div className="border-b bg-primary/5 px-6 py-2 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium">
              <Loader2 className="size-3 animate-spin" />
              Rendering full video…
            </span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(renderProgress * 100)}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.round(renderProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {renderStatus === 'completed' && (
        <div className="border-b border-emerald-500/40 bg-emerald-500/10 px-6 py-2 text-xs text-emerald-200">
          Render complete · output.mp4 saved.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_320px]">
        <aside className="overflow-y-auto border-r p-3">
          {project.segments.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No segments yet. Ask Claude in the terminal to build the storyboard for this
              project.
            </p>
          ) : (
            <ul className="space-y-1">
              {project.segments.map((s, idx) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      s.id === selectedId
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:bg-secondary'
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">
                        {idx + 1}. {s.scene}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {s.durationSec.toFixed(1)}s
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">{s.text}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-h-0 overflow-hidden">
          <div className="flex h-full w-full flex-col items-center gap-3 overflow-y-auto bg-black/40 p-4">
            <PlayerPane
              project={project}
              selectedSegmentId={selectedId}
              onSelectSegment={setSelectedId}
              previewVariantId={previewVariantId}
            />
            <VariantsPanel
              project={project}
              activeVariantId={previewVariantId}
              onSelectVariant={setPreviewVariantId}
              onRenderVariant={(variantId) => triggerRender(variantId)}
              renderingVariantId={renderingVariantId}
              outputs={outputsByVariant}
            />
          </div>
        </section>

        <aside className="overflow-y-auto border-l p-4">
          {selected ? (
            <SegmentEditor
              segment={selected}
              language={project.language}
              aspect={project.aspect}
              activeVariantId={previewVariantId}
              variants={project.variants ?? []}
              onChange={(patch) => updateSegment(selected.id, patch)}
              onApplyStyle={(args) =>
                applyStyle({
                  ...args,
                  segmentId: selected.id,
                  sceneKind: String(selected.scene),
                  variantId: previewVariantId,
                })
              }
              onApplyFont={(args) =>
                applyFont({
                  ...args,
                  segmentId: selected.id,
                  variantId: previewVariantId,
                })
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a segment to edit, or ask Claude to add segments.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}

function SegmentEditor({
  segment,
  language,
  aspect,
  activeVariantId,
  variants,
  onChange,
  onApplyStyle,
  onApplyFont,
}: {
  segment: Segment
  language: Project['language']
  aspect: Project['aspect']
  activeVariantId: string | null
  variants: Project['variants']
  onChange: (patch: Partial<Segment>) => void
  onApplyStyle: (input: {
    styleId: string
    scope: 'segmentInVariant' | 'segment' | 'sceneKind' | 'all'
  }) => void
  onApplyFont: (input: {
    fontId: string
    scope: 'segmentInVariant' | 'segment' | 'all'
  }) => void
}) {
  const [synthStatus, setSynthStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [synthError, setSynthError] = useState<string | null>(null)

  const resynth = async () => {
    setSynthStatus('running')
    setSynthError(null)
    try {
      const res = await fetch('/api/voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: segment.voice.voiceId || DEFAULT_VOICES[language],
          text: segment.text,
          speed: segment.voice.speed,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const { path, durationSec } = (await res.json()) as { path: string; durationSec: number }
      onChange({
        audio: {
          ...segment.audio,
          narration: {
            kind: 'audio',
            path,
            source: { provider: 'edge-tts', id: segment.voice.voiceId || DEFAULT_VOICES[language] },
            durationSec,
          },
        },
      })
      setSynthStatus('idle')
    } catch (err) {
      setSynthStatus('error')
      setSynthError(err instanceof Error ? err.message : String(err))
    }
  }

  // Resolve the text style currently applied to this segment using the
  // same priority the renderer uses:
  //   variant.textStyleBySegmentId[segId]
  //   → segment.textStyleId
  //   → variant.textStyleBySceneKind[scene]
  //   → none (renderer falls back to 'classic')
  const activeVariant = variants?.find((v) => v.id === activeVariantId)
  const perVariantStyleId = activeVariant?.textStyleBySegmentId?.[segment.id]
  const variantSceneStyleId = activeVariant?.textStyleBySceneKind?.[String(segment.scene)]
  const resolvedStyleId =
    perVariantStyleId ?? segment.textStyleId ?? variantSceneStyleId ?? undefined
  const resolvedStyle = findTextStyle(resolvedStyleId, [])
  // Whether the currently-applied style is variant-specific (vs. global).
  const styleScope: 'variant' | 'segment' | 'sceneKind' | 'default' =
    perVariantStyleId
      ? 'variant'
      : segment.textStyleId
        ? 'segment'
        : variantSceneStyleId
          ? 'sceneKind'
          : 'default'

  // Surface narration length so users see when the planned slot is too
  // short. 0.2s tolerance because the renderer guards anyway — only flag
  // when the gap is meaningful.
  const narrationSec = segment.audio?.narration?.durationSec ?? 0
  const durationTooShort = narrationSec > 0 && segment.durationSec < narrationSec + 0.2

  // Font override resolution mirrors style resolution: variant per-segment
  // override → segment override → style.fontFamily fallback.
  const perVariantFontId = activeVariant?.fontOverrideBySegmentId?.[segment.id]
  const resolvedFontId =
    perVariantFontId ?? segment.fontOverride ?? resolvedStyle?.fontFamily ?? undefined
  const fontScope: 'variant' | 'segment' | 'style' = perVariantFontId
    ? 'variant'
    : segment.fontOverride
      ? 'segment'
      : 'style'

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="segment-text">Narration</Label>
        <Textarea
          id="segment-text"
          className="mt-1"
          rows={6}
          value={segment.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="segment-duration">Duration (s)</Label>
          <Input
            id="segment-duration"
            className={cn(
              'mt-1',
              durationTooShort ? 'border-destructive focus-visible:ring-destructive' : ''
            )}
            type="number"
            min={1}
            max={60}
            step={0.5}
            value={segment.durationSec}
            onChange={(e) => {
              const v = Number.parseFloat(e.target.value)
              if (Number.isFinite(v) && v > 0) onChange({ durationSec: v })
            }}
          />
          {narrationSec > 0 ? (
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
              <span
                className={cn(
                  'text-muted-foreground',
                  durationTooShort ? 'text-destructive' : ''
                )}
                title={
                  durationTooShort
                    ? 'Narration is longer than this slot — audio will be cut off.'
                    : 'Narration audio length for this segment.'
                }
              >
                narration: {narrationSec.toFixed(1)}s
              </span>
              {durationTooShort ? (
                <button
                  type="button"
                  className="rounded border border-destructive px-1.5 py-0.5 text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    onChange({
                      durationSec: recommendSegmentDurationSec(narrationSec, segment.durationSec),
                    })
                  }
                  title="Stretch this segment to fit narration + 0.4s buffer"
                >
                  Auto-fit
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <Label htmlFor="segment-scene">Scene</Label>
          <Input
            id="segment-scene"
            className="mt-1"
            value={segment.scene}
            onChange={(e) => onChange({ scene: e.target.value })}
          />
        </div>
      </div>

      <div>
        <Label>Voice</Label>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
            {segment.voice.voiceId || DEFAULT_VOICES[language]}
          </code>
          <VoicePicker
            language={language}
            currentVoiceId={segment.voice.voiceId}
            onSelect={(voiceId) =>
              onChange({ voice: { ...segment.voice, voiceId } })
            }
            trigger={
              <Button variant="outline" size="sm">
                <Mic />
                Change
              </Button>
            }
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resynth}
            disabled={synthStatus === 'running' || !segment.text.trim()}
            className="w-full"
            title="Generate the narration mp3 with the current voice and text"
          >
            {synthStatus === 'running' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            {synthStatus === 'running' ? 'Synthesizing…' : 'Re-synth narration'}
          </Button>
        </div>
        {synthError ? (
          <p className="mt-1 text-xs text-destructive">{synthError}</p>
        ) : null}
        <p className="mt-1 text-[10px] text-muted-foreground">
          Changing the voice only updates metadata. Click Re-synth to regenerate the audio.
        </p>
      </div>

      <div>
        <Label htmlFor="segment-speed">Speed</Label>
        <Input
          id="segment-speed"
          className="mt-1"
          type="number"
          min={0.5}
          max={2}
          step={0.1}
          value={segment.voice.speed}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value)
            if (Number.isFinite(v)) onChange({ voice: { ...segment.voice, speed: v } })
          }}
        />
      </div>

      <div>
        <Label>Text style</Label>
        <div className="mt-1 space-y-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
              {resolvedStyleId ?? 'inherited from variant'}
            </code>
            <StylePicker
              currentStyleId={resolvedStyleId}
              sampleText={segment.text || 'Aa'}
              sceneKind={String(segment.scene)}
              activeVariantId={activeVariantId}
              onApply={onApplyStyle}
              trigger={
                <Button variant="outline" size="sm">
                  <Type />
                  Change
                </Button>
              }
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {styleScope === 'variant'
              ? `Pinned in variant ${activeVariantId} only. Other variants render this segment with their own style.`
              : styleScope === 'segment'
                ? 'Pinned on this segment across every variant.'
                : styleScope === 'sceneKind'
                  ? `Inherited from variant ${activeVariantId ?? '(default)'} for ${String(segment.scene)}.`
                  : `No override — variant default for ${String(segment.scene)} segments wins.`}
          </p>
        </div>
      </div>

      <div>
        <Label>Font</Label>
        <div className="mt-1 space-y-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
              {resolvedFontId ?? '—'}
            </code>
            <FontPicker
              currentFontId={resolvedFontId}
              sampleText={segment.text || 'Aa'}
              activeVariantId={activeVariantId}
              onApply={onApplyFont}
              trigger={
                <Button variant="outline" size="sm">
                  <Type />
                  Change
                </Button>
              }
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {fontScope === 'variant'
              ? `Pinned in variant ${activeVariantId} only. Other variants keep the style's default font.`
              : fontScope === 'segment'
                ? 'Pinned on this segment across every variant.'
                : 'Inherits the font baked into the text style.'}
          </p>
        </div>
      </div>

      <div>
        <Label>Sound effect</Label>
        {resolvedStyle?.sfx ? (
          <div className="mt-1 space-y-1 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
            {resolvedStyle.sfx.enterSoundId ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Enter</span>
                <code className="font-mono">{resolvedStyle.sfx.enterSoundId}</code>
              </div>
            ) : (
              <div className="text-muted-foreground">No enter cue</div>
            )}
            {resolvedStyle.sfx.perWordSoundId ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Per word</span>
                <code className="font-mono">{resolvedStyle.sfx.perWordSoundId}</code>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {segment.textStyleId
              ? 'This style has no SFX cues.'
              : 'SFX is set by the resolved text style — pick one above to hear cues.'}
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          SFX bound to the picked style. Adjust master volume in the header.
        </p>
      </div>

      <div>
        <Label>Background image</Label>
        <div className="mt-1 space-y-2">
          {segment.visuals.background ? (
            <div className="overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(segment.visuals.background.path) ?? ''}
                alt=""
                className="block max-h-40 w-full object-cover"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No image set.</p>
          )}
          <ImagePicker
            defaultQuery={segment.text.split(/\s+/).slice(0, 4).join(' ')}
            orientation={inferOrientation(aspect)}
            onSelect={(asset: AssetRef) =>
              onChange({ visuals: { ...segment.visuals, background: asset } })
            }
            trigger={
              <Button variant="outline" size="sm" className="w-full">
                <ImageIcon />
                {segment.visuals.background ? 'Swap image' : 'Find image'}
              </Button>
            }
          />
        </div>
      </div>
    </div>
  )
}

function inferOrientation(aspect: Project['aspect']): 'landscape' | 'portrait' | 'square' {
  if (aspect === '16:9') return 'landscape'
  if (aspect === '1:1') return 'square'
  return 'portrait'
}
