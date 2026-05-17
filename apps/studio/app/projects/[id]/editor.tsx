'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Captions,
  CaptionsOff,
  ChevronDown,
  Crop,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Languages,
  Layers,
  Loader2,
  Mic,
  Music,
  Palette,
  PlayCircle,
  RefreshCw,
  Save,
  Share2,
  Stamp,
  Type,
  Volume2,
} from 'lucide-react'
import {
  DEFAULT_VOICES,
  type AssetRef,
  type BackgroundEdits,
  type ColorOverride,
  type Project,
  type Segment,
  type TextSfx,
  type TextStyle,
  type WordBoundary,
} from '@news-tok/shared/schema'
import { findTextStyle } from '@news-tok/shared/text-styles'
import { recommendSegmentDurationSec } from '@news-tok/shared/sanitize'
import { PlayerPane } from '@/components/studio/player-pane'
import { VariantsPanel } from '@/components/studio/variants-panel'
import { VoicePicker } from '@/components/studio/voice-picker'
import { ImagePicker } from '@/components/studio/image-picker'
import { ImageLibrary } from '@/components/studio/image-library'
import { ImageEditorDialog } from '@/components/studio/image-editor-dialog'
import {
  VideoEditorDialog,
  videoEditorInitial,
} from '@/components/studio/video-editor-dialog'
import { MusicPicker } from '@/components/studio/music-picker'
import { BgMusicTrimDialog } from '@/components/studio/bg-music-trim-dialog'
import { LayoutPicker } from '@/components/studio/layout-picker'
import { layoutNeedsSlot } from '@/lib/layouts-catalog'
import { StylePicker } from '@/components/studio/style-picker'
import { FontPicker } from '@/components/studio/font-picker'
import { ColorPicker } from '@/components/studio/color-picker'
import { StyleCopyPaste } from '@/components/studio/style-copy-paste'
import { SocialCaptionDialog } from '@/components/studio/social-caption-dialog'
import { ProjectSettingsDialog } from '@/components/studio/project-settings-dialog'
import { SfxPicker } from '@/components/studio/sfx-picker'
import { LogoPicker } from '@/components/studio/logo-picker'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { assetUrl } from '@/lib/asset-url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'saving' | 'saved' | 'error'
type RenderStatus = 'idle' | 'running' | 'completed' | 'failed'
type GenVoiceStatus = 'idle' | 'running' | 'success' | 'error'

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
  /** State of the batch "Gen voice tất cả" toolbar action. */
  const [genVoiceStatus, setGenVoiceStatus] = useState<GenVoiceStatus>('idle')
  const [genVoiceError, setGenVoiceError] = useState<string | null>(null)
  /** Human-readable summary of the last batch run (shown briefly). */
  const [genVoiceSummary, setGenVoiceSummary] = useState<string | null>(null)
  /** When set, opens the VoicePicker for a batch-gen flow. The string
   *  is the mode the picker should run on completion. null = closed. */
  const [voicePickerMode, setVoicePickerMode] = useState<'missing' | 'all' | null>(null)
  /** Brief feedback for the "Open folder" toolbar action. */
  const [openFolderError, setOpenFolderError] = useState<string | null>(null)

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

  // Two-step bgMusic flow:
  //   1. MusicPicker.onSelect → stash the picked AssetRef in `trimPending`
  //      and open the trim dialog (UX choice confirmed by the user — auto-
  //      open with a "Skip trim" escape hatch).
  //   2. BgMusicTrimDialog.onApply → commit the track + edits + volume to
  //      the project in one PATCH, then clear the pending state.
  // Re-editing an already-applied track: clicking the Music button when
  // project.bgMusic is set opens the trim dialog directly against the
  // existing track (skips MusicPicker).
  const [trimPending, setTrimPending] = useState<AssetRef | null>(null)
  const [trimDialogOpen, setTrimDialogOpen] = useState(false)
  const totalVideoDurationSec = useMemo(
    () => project.segments.reduce((s, seg) => s + seg.durationSec, 0),
    [project.segments]
  )

  /**
   * Broadcast a single SFX configuration to every segment in the
   * project. The picker always passes a concrete TextSfx (even an
   * "all-None" one) because the renderer resolves
   *   segment.sfxOverride ?? style.sfx
   * — so a present-but-empty override is what truly silences cues
   * (clearing the override would let the style's default SFX leak
   * back through, which is the exact bug this codepath fixes).
   */
  const applySfxToAll = useCallback((next: TextSfx) => {
    setProject((p) => ({
      ...p,
      segments: p.segments.map((s) => ({
        ...s,
        sfxOverride: next,
      })),
      updatedAt: new Date().toISOString(),
    }))
  }, [])

  /**
   * Replace the project.library list. Called by ImageLibrary after a
   * successful POST/DELETE so the client mirrors disk without needing
   * a full project reload. Marks the lastSavedSig so the toolbar's
   * "Save*" badge doesn't light up — the library endpoint already
   * persisted the new list.
   */
  const onLibraryChange = useCallback((nextLibrary: AssetRef[]) => {
    setProject((p) => {
      const merged: Project = {
        ...p,
        library: nextLibrary,
        updatedAt: new Date().toISOString(),
      }
      setLastSavedSig(projectSignature(merged))
      return merged
    })
  }, [])

  /**
   * Apply the first N library images to segments missing a background
   * image. Walks segments in order, skipping any that already have one.
   * Returns the count actually filled so the panel can show a toast.
   */
  const autoFillEmptySegments = useCallback((assets: AssetRef[]): number => {
    let filled = 0
    setProject((p) => {
      let cursor = 0
      const segments = p.segments.map((s) => {
        if (s.visuals.background) return s
        const asset = assets[cursor++]
        if (!asset) return s
        filled += 1
        return {
          ...s,
          visuals: { ...s.visuals, background: asset },
        }
      })
      if (filled === 0) return p
      return { ...p, segments, updatedAt: new Date().toISOString() }
    })
    return filled
  }, [])

  /**
   * Merge a user-authored style into project.userTextStyles after the
   * builder POSTs it to disk. Without this, the React state lags the
   * file; a subsequent project Save (PATCH /api/projects/[id]) would
   * round-trip the stale state back to disk and the style would
   * "disappear" after F5. Replaces an existing entry when ids match
   * (Update flow), otherwise appends.
   */
  const onUserStyleSaved = useCallback((style: TextStyle) => {
    setProject((p) => {
      const existing = p.userTextStyles ?? []
      const idx = existing.findIndex((s) => s.id === style.id)
      const next =
        idx >= 0
          ? existing.map((s, i) => (i === idx ? style : s))
          : [...existing, style]
      const merged: Project = {
        ...p,
        userTextStyles: next,
        updatedAt: new Date().toISOString(),
      }
      // Disk is already in sync with `next` (POST wrote it directly),
      // so mark this state as the saved baseline. Otherwise the
      // toolbar Save button would light up as "dirty" purely because
      // the client state grew a new entry that we just rolled in.
      setLastSavedSig(projectSignature(merged))
      return merged
    })
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
   * Apply a ColorOverride. Mirrors `applyFont` scopes but writes to
   * `variant.colorOverrideBySegmentId` / `segment.colorOverride` so a
   * user can swap accent / primary / stroke / idle colours per segment
   * (or pin them per-variant) without forking the entire text style.
   */
  const applyColor = useCallback(
    (input: {
      colorOverride: ColorOverride
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
              colorOverrideBySegmentId: {
                ...(v.colorOverrideBySegmentId ?? {}),
                [input.segmentId]: input.colorOverride,
              },
            }
          })
          return { ...p, variants, updatedAt: new Date().toISOString() }
        }
        const next = p.segments.map((s) => {
          if (input.scope === 'segment') {
            return s.id === input.segmentId ? { ...s, colorOverride: input.colorOverride } : s
          }
          if (input.scope === 'all') {
            return { ...s, colorOverride: input.colorOverride }
          }
          return s
        })
        return { ...p, segments: next, updatedAt: new Date().toISOString() }
      })
    },
    []
  )

  /**
   * Paste a previously-copied style cluster onto one or more segments
   * in a single atomic setProject call. The "cluster" includes layout
   * id + slot fields (eyebrow / chips / fileId), text style id, font
   * override, and colour override.
   *
   * Three modes:
   *   - 'segment'   — paste onto `targetSegmentId` only.
   *   - 'sceneKind' — paste onto every segment whose scene kind
   *                   matches `targetSceneKind` (eg every title).
   *   - 'all'       — paste onto every segment in the project.
   *
   * Variant-scoped behaviour: if the user is previewing a variant
   * (variantId !== null) AND the source was copied while previewing
   * a variant too, the variant-scoped overrides (textStyle / font /
   * colour BySegmentId) are written too so the paste is faithful to
   * what the user was looking at. Otherwise we touch only the
   * segment-level fields and leave variant overrides alone.
   *
   * One setProject call so React Studio doesn't re-render four times
   * for one user action — important when "Paste to all" hits 12
   * segments.
   */
  const applyStylePaste = useCallback(
    (input: {
      snapshot: {
        layoutId: string | undefined
        eyebrow: string | undefined
        chips: string[] | undefined
        fileId: string | undefined
        textStyleId: string | undefined
        fontOverride: string | undefined
        colorOverride: ColorOverride | undefined
        sourceVariantId: string | null
      }
      mode: 'segment' | 'sceneKind' | 'all'
      targetSegmentId: string
      targetSceneKind: string
      variantId: string | null
    }) => {
      const { snapshot, mode, targetSegmentId, targetSceneKind, variantId } = input
      const writeVariantOverrides =
        !!variantId && variantId === snapshot.sourceVariantId

      const shouldTouch = (s: Segment): boolean => {
        if (mode === 'segment') return s.id === targetSegmentId
        if (mode === 'sceneKind') return String(s.scene) === targetSceneKind
        return true
      }

      setProject((p) => {
        const segments = p.segments.map((s) => {
          if (!shouldTouch(s)) return s
          // Build the segment-level patch. Always copy the layout
          // cluster + style overrides — pasting "nothing" (undefined)
          // for a field is intentional, the user wants the target to
          // match the source exactly even if the source had no value.
          return {
            ...s,
            layoutId: snapshot.layoutId,
            eyebrow: snapshot.eyebrow,
            chips: snapshot.chips,
            fileId: snapshot.fileId,
            textStyleId: snapshot.textStyleId,
            fontOverride: snapshot.fontOverride,
            colorOverride: snapshot.colorOverride,
          }
        })

        let variants = p.variants ?? []
        if (writeVariantOverrides && variantId) {
          // Determine which segment ids the paste targeted so we can
          // mirror the override write into the variant maps. Same
          // shouldTouch rule, just collected to a list.
          const targetIds = p.segments.filter(shouldTouch).map((s) => s.id)
          variants = variants.map((v) => {
            if (v.id !== variantId) return v
            const nextStyle = { ...(v.textStyleBySegmentId ?? {}) }
            const nextFont = { ...(v.fontOverrideBySegmentId ?? {}) }
            const nextColor = { ...(v.colorOverrideBySegmentId ?? {}) }
            for (const id of targetIds) {
              // Setting to the snapshot value (including undefined)
              // overrides the variant's previous pin. We delete the
              // key when the snapshot has no value, so the variant
              // falls back to the segment-level write above instead
              // of a stale variant pin.
              if (snapshot.textStyleId) nextStyle[id] = snapshot.textStyleId
              else delete nextStyle[id]
              if (snapshot.fontOverride) nextFont[id] = snapshot.fontOverride
              else delete nextFont[id]
              if (snapshot.colorOverride) nextColor[id] = snapshot.colorOverride
              else delete nextColor[id]
            }
            return {
              ...v,
              textStyleBySegmentId: nextStyle,
              fontOverrideBySegmentId: nextFont,
              colorOverrideBySegmentId: nextColor,
            }
          })
        }

        return {
          ...p,
          segments,
          variants,
          updatedAt: new Date().toISOString(),
        }
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

  /**
   * Batch-synthesize narration for every segment that needs it.
   *
   *   - mode 'missing' fills only segments without audio (the common path
   *     after manually adding new segments).
   *   - mode 'all' re-synthesizes everything, useful after changing the
   *     project voice.
   *   - voiceId, when provided, overrides every segment's voice and
   *     forces the batch onto that voice. When omitted each segment
   *     keeps its current voiceId (falling back to the language default).
   *
   * Posts to /api/projects/[id]/voice-all, which writes the new
   * storyboard to disk. We then replace the local state with the server
   * response so the editor instantly reflects the new asset paths +
   * stretched durations. Refuses to start when there are unsaved
   * changes so we never overwrite local edits with a stale disk copy.
   */
  const generateAllVoices = useCallback(
    async (mode: 'missing' | 'all', voiceId?: string) => {
      if (isDirty) {
        setGenVoiceError('Có thay đổi chưa lưu — hãy Save trước khi gen voice.')
        setGenVoiceStatus('error')
        return
      }
      setGenVoiceStatus('running')
      setGenVoiceError(null)
      setGenVoiceSummary(null)
      try {
        const res = await fetch(`/api/projects/${project.id}/voice-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onlyMissing: mode === 'missing',
            ...(voiceId ? { voiceId } : {}),
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        const data = (await res.json()) as {
          project: Project
          summary: { total: number; synthesized: number; skipped: number; failed: number }
        }
        // Replace local state with the server-truth project, and reset
        // the dirty baseline so the Save button doesn't immediately
        // light up because narration paths changed.
        setProject(data.project)
        setLastSavedSig(projectSignature(data.project))
        const s = data.summary
        setGenVoiceSummary(
          `Đã tạo ${s.synthesized}/${s.total}` +
            (s.skipped ? ` · bỏ qua ${s.skipped}` : '') +
            (s.failed ? ` · lỗi ${s.failed}` : '')
        )
        setGenVoiceStatus(s.failed > 0 ? 'error' : 'success')
        if (s.failed > 0) {
          setGenVoiceError(`${s.failed} segment gen voice thất bại`)
        }
        setTimeout(() => {
          setGenVoiceStatus((cur) => (cur === 'success' ? 'idle' : cur))
        }, 3000)
      } catch (err) {
        setGenVoiceStatus('error')
        setGenVoiceError(err instanceof Error ? err.message : String(err))
      }
    },
    [isDirty, project.id]
  )

  const openProjectFolder = useCallback(async () => {
    setOpenFolderError(null)
    try {
      const res = await fetch(`/api/projects/${project.id}/open-folder`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      setOpenFolderError(
        `Open folder failed: ${err instanceof Error ? err.message : String(err)}`
      )
      setTimeout(() => setOpenFolderError(null), 4000)
    }
  }, [project.id])

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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight">
            {project.title}
          </h1>
          <p className="mt-0.5 truncate whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground/70">
            <span className="inline-flex items-center gap-1">
              <Film className="size-3" />
              {project.aspect}
            </span>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" />
              {project.segments.length} segments
            </span>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="inline-flex items-center gap-1">
              <Languages className="size-3" />
              {project.language}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={openProjectFolder}
            title="Open this project's folder in your file manager (output.mp4 lives here)"
            aria-label="Open project folder"
          >
            <FolderOpen />
            Folder
          </Button>
          {/* Subs / Music / Watermark moved to the right aside's
              PROJECT section so the header stays focused on
              navigation + save/render actions. */}
          <ProjectSettingsDialog
            exportPreset={project.exportPreset}
            sfxVolume={project.sfxVolume ?? 0.7}
            showSceneBadges={project.showSceneBadges ?? false}
            onChangePreset={(preset) => updateProject({ exportPreset: preset })}
            onChangeSfxVolume={(v) => updateProject({ sfxVolume: v })}
            onChangeShowSceneBadges={(show) => updateProject({ showSceneBadges: show })}
          />
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
          {/* Batch gen-voice split button:
                primary action fills only missing narration with each
                segment's current voice (safe default). The dropdown
                caret exposes: re-gen all with current voices, or pick
                a single voice and apply it to every segment. */}
          <div className="inline-flex items-stretch">
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateAllVoices('missing')}
              disabled={
                genVoiceStatus === 'running' || project.segments.length === 0
              }
              title={
                genVoiceStatus === 'running'
                  ? 'Đang tạo giọng đọc cho tất cả segment…'
                  : 'Tạo giọng đọc cho mọi segment chưa có narration (giữ giọng hiện tại)'
              }
              className="rounded-r-none border-r-0"
            >
              {genVoiceStatus === 'running' ? (
                <>
                  <Loader2 className="animate-spin" />
                  Gen voice…
                </>
              ) : (
                <>
                  <Mic />
                  Gen voice all
                </>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    genVoiceStatus === 'running' || project.segments.length === 0
                  }
                  title="Tuỳ chọn gen voice"
                  className="rounded-l-none px-2"
                  aria-label="Tuỳ chọn gen voice"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Giữ giọng hiện tại của từng segment</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    // Defer the API call by one frame so Radix can finish
                    // closing the menu first. Without this, the action
                    // immediately disables the trigger (genVoiceStatus =
                    // 'running'), and Radix's close transition stalls
                    // trying to refocus a disabled element — leaving the
                    // popover stuck open while the request runs.
                    requestAnimationFrame(() => void generateAllVoices('missing'))
                  }}
                >
                  Chỉ segment chưa có giọng
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    requestAnimationFrame(() => void generateAllVoices('all'))
                  }}
                >
                  Tạo lại toàn bộ (ghi đè)
                </DropdownMenuItem>
                <DropdownMenuLabel className="mt-1 border-t pt-2">
                  Chọn giọng khác cho cả project
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={(e) => {
                    // For the picker-flow items we keep preventDefault +
                    // a deferred state update: the menu closes on its
                    // own next tick, then the dialog opens cleanly
                    // without fighting Radix for focus.
                    e.preventDefault()
                    requestAnimationFrame(() => setVoicePickerMode('missing'))
                  }}
                >
                  Chọn giọng & gen segment chưa có
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    requestAnimationFrame(() => setVoicePickerMode('all'))
                  }}
                >
                  Chọn giọng & tạo lại toàn bộ
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <VoicePicker
            language={project.language}
            currentVoiceId={
              project.segments[0]?.voice.voiceId || DEFAULT_VOICES[project.language]
            }
            open={voicePickerMode !== null}
            onOpenChange={(open) => {
              if (!open) setVoicePickerMode(null)
            }}
            onSelect={(voiceId) => {
              const mode = voicePickerMode
              setVoicePickerMode(null)
              if (mode) void generateAllVoices(mode, voiceId)
            }}
          />
          <SocialCaptionDialog
            projectId={project.id}
            trigger={
              <Button
                variant="outline"
                size="sm"
                disabled={project.segments.length === 0}
                title="Tạo description + hashtag cho TikTok / Facebook / Instagram"
              >
                <Share2 />
                Caption
              </Button>
            }
          />
          {project.variants && project.variants.length > 0 ? (
            // Split button: primary action "Render all" on the left, a
            // narrow caret on the right opens a native <select> hidden
            // overlay to pick one variant. Visually a single control so
            // the eye doesn't have to parse two separate render entries.
            <div className="inline-flex items-stretch">
              <Button
                size="sm"
                onClick={() => triggerRender('all')}
                disabled={renderStatus === 'running' || project.segments.length === 0}
                title="Render every declared variant to output-<id>.mp4"
                className="rounded-r-none border-r-0"
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={renderStatus === 'running' || project.segments.length === 0}
                    title="Pick one variant to render"
                    className="rounded-l-none px-2"
                    aria-label="Render single variant"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Render one variant</DropdownMenuLabel>
                  {project.variants.map((v) => (
                    <DropdownMenuItem key={v.id} onSelect={() => triggerRender(v.id)}>
                      Render {v.id} · {v.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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

      {(saveError || renderError || genVoiceError || openFolderError) && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-xs text-destructive">
          {saveError ?? renderError ?? genVoiceError ?? openFolderError}
        </div>
      )}

      {genVoiceStatus === 'running' && (
        <div className="flex items-center gap-2 border-b bg-primary/5 px-6 py-2 text-xs text-foreground">
          <Loader2 className="size-3 animate-spin" />
          <span>
            Đang tạo giọng đọc cho từng segment… Edge TTS chạy tuần tự nên có thể
            mất vài chục giây.
          </span>
        </div>
      )}

      {genVoiceStatus === 'success' && genVoiceSummary && (
        <div className="border-b bg-emerald-500/10 px-6 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          {genVoiceSummary}
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
        <div className="border-b border-emerald-500/40 bg-emerald-500/10 px-6 py-2 text-xs text-emerald-700 dark:text-emerald-200">
          Render complete · output.mp4 saved.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_360px]">
        {/* Reserve a scrollbar gutter on both asides so the column
            width stays constant whether or not the content overflows.
            Without this, switching segments / tabs causes horizontal
            jitter as the OS toggles the scrollbar in and out. */}
        <aside className="overflow-y-auto border-r p-3 [scrollbar-gutter:stable]">
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
              renderProgress={
                renderStatus === 'running' && renderingVariantId
                  ? renderProgress
                  : undefined
              }
              outputs={outputsByVariant}
            />
          </div>
        </section>

        <aside className="overflow-y-auto border-l p-4 [scrollbar-gutter:stable]">
          {/* PROJECT scope controls — always visible regardless of
              segment selection. Inline with the SegmentEditor below
              (no card chrome) so the aside reads as one continuous
              column. Icon-only buttons with tooltips keep the row
              from wrapping in a 280px aside. */}
          <section className="mb-4 flex items-center justify-between gap-2 pb-3 border-b">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Project
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant={project.subtitles.enabled ? 'default' : 'outline'}
                size="icon"
                onClick={() =>
                  updateProject({
                    subtitles: {
                      enabled: !project.subtitles.enabled,
                      bottomPct: project.subtitles.bottomPct,
                    },
                  })
                }
                title={
                  project.subtitles.enabled
                    ? 'Subtitles on — click to hide'
                    : 'Subtitles off — click to show'
                }
                aria-label={project.subtitles.enabled ? 'Hide subtitles' : 'Show subtitles'}
              >
                {project.subtitles.enabled ? <Captions /> : <CaptionsOff />}
              </Button>
              <div className="inline-flex items-center gap-1">
                <MusicPicker
                  defaultMood="calm"
                  defaultDurationSec={
                    project.segments.reduce((s, x) => s + x.durationSec, 0) || 30
                  }
                  // Picker no longer commits directly — it stashes the picked
                  // track and opens the trim dialog. Trim dialog applies in
                  // a single PATCH (bgMusic + bgMusicEdits + bgMusicVolume).
                  onSelect={(asset) => {
                    setTrimPending(asset)
                    setTrimDialogOpen(true)
                  }}
                  trigger={
                    <Button
                      variant={project.bgMusic ? 'default' : 'outline'}
                      size="icon"
                      title={
                        project.bgMusic
                          ? 'Background music attached — click to swap'
                          : 'Add background music'
                      }
                      aria-label="Background music"
                    >
                      <Music />
                    </Button>
                  }
                />
                {project.bgMusic ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit trim / fade / volume"
                    aria-label="Edit background music"
                    onClick={() => {
                      setTrimPending(project.bgMusic!)
                      setTrimDialogOpen(true)
                    }}
                  >
                    <Crop className="size-4" />
                  </Button>
                ) : null}
              </div>
              <LogoPicker
                projectId={project.id}
                logo={project.logo ?? { kind: 'none' }}
                onChange={(next) => updateProject({ logo: next })}
                aspect={project.aspect}
                previewBackground={
                  project.segments.find((s) => s.visuals.background?.path)?.visuals
                    .background?.path
                }
                trigger={
                  <Button
                    variant={
                      project.logo && project.logo.kind !== 'none' ? 'default' : 'outline'
                    }
                    size="icon"
                    title={
                      !project.logo || project.logo.kind === 'none'
                        ? 'Add a logo or text watermark'
                        : 'Watermark on — click to edit'
                    }
                    aria-label="Watermark"
                  >
                    <Stamp />
                  </Button>
                }
              />
            </div>
          </section>

          {selected ? (
            <SegmentEditor
              segment={selected}
              segmentIndex={
                // 1-based — matches how the segment list numbers
                // them ("1. TITLE 5.0s …"). findIndex is O(n)
                // per render but the list maxes at a couple dozen
                // segments; a memo would be heavier than the lookup.
                project.segments.findIndex((s) => s.id === selected.id) + 1
              }
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
              onApplyColor={(args) =>
                applyColor({
                  ...args,
                  segmentId: selected.id,
                  variantId: previewVariantId,
                })
              }
              onPasteStyle={(args) =>
                applyStylePaste({
                  snapshot: args.snapshot,
                  mode: args.mode,
                  targetSegmentId: selected.id,
                  targetSceneKind: String(selected.scene),
                  variantId: previewVariantId,
                })
              }
              onUserStyleSaved={onUserStyleSaved}
              projectId={project.id}
              customSfx={project.customSfx ?? []}
              onCustomSfxChange={(next) =>
                updateProject({ customSfx: next })
              }
              onApplySfxToAll={applySfxToAll}
              library={project.library ?? []}
              onLibraryChange={onLibraryChange}
              onAutoFillEmpty={autoFillEmptySegments}
              emptySegmentCount={project.segments.filter((s) => !s.visuals.background).length}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a segment to edit, or ask Claude to add segments.
            </p>
          )}
        </aside>
      </div>
      <BgMusicTrimDialog
        open={trimDialogOpen}
        onOpenChange={(open) => {
          setTrimDialogOpen(open)
          if (!open) setTrimPending(null)
        }}
        track={trimPending}
        videoDurationSec={totalVideoDurationSec}
        initialVolume={project.bgMusicVolume ?? 0.2}
        initialEdits={
          project.bgMusicEdits ?? {
            trimStartSec: 0,
            fadeInSec: 0,
            fadeOutSec: 1.2,
            ducking: { enabled: false, ratio: 0.3, smoothMs: 200 },
          }
        }
        // Ducking aligns to wordBoundaries — flag this up to the dialog
        // so it can warn the user when no segment has had TTS run yet.
        hasNarration={project.segments.some(
          (s) => (s.wordBoundaries?.length ?? 0) > 0
        )}
        onApply={(next) => {
          // Commit track + edits + volume in one PATCH so a half-applied
          // change can't leave the project in an inconsistent state.
          updateProject({
            bgMusic: next.bgMusic,
            bgMusicEdits: next.bgMusicEdits,
            bgMusicVolume: next.bgMusicVolume,
          })
        }}
      />
    </div>
  )
}

function SegmentEditor({
  segment,
  language,
  aspect,
  activeVariantId,
  variants,
  segmentIndex,
  onChange,
  onApplyStyle,
  onApplyFont,
  onApplyColor,
  onPasteStyle,
  onUserStyleSaved,
  projectId,
  customSfx,
  onCustomSfxChange,
  onApplySfxToAll,
  library,
  onLibraryChange,
  onAutoFillEmpty,
  emptySegmentCount,
}: {
  segment: Segment
  /** 1-based position in the storyboard. Used by the style-clipboard
   *  hint copy ("Đã chép từ segment 2 (…)"). */
  segmentIndex: number
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
  onApplyColor: (input: {
    colorOverride: ColorOverride
    scope: 'segmentInVariant' | 'segment' | 'all'
  }) => void
  /** Paste a previously-copied style cluster onto one (mode=segment),
   *  some (mode=sceneKind), or all (mode=all) segments. The snapshot
   *  is the StyleSnapshot from style-clipboard; we widen to a
   *  structural type so editor.tsx doesn't need to import the hook. */
  onPasteStyle: (input: {
    snapshot: {
      layoutId: string | undefined
      eyebrow: string | undefined
      chips: string[] | undefined
      fileId: string | undefined
      textStyleId: string | undefined
      fontOverride: string | undefined
      colorOverride: ColorOverride | undefined
      sourceVariantId: string | null
    }
    mode: 'segment' | 'sceneKind' | 'all'
  }) => void
  onUserStyleSaved: (style: TextStyle) => void
  projectId: string
  customSfx: Project['customSfx']
  onCustomSfxChange: (next: Project['customSfx']) => void
  onApplySfxToAll: (next: TextSfx) => void
  library: AssetRef[]
  onLibraryChange: (next: AssetRef[]) => void
  onAutoFillEmpty: (assets: AssetRef[]) => number
  emptySegmentCount: number
}) {
  const [synthStatus, setSynthStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [synthError, setSynthError] = useState<string | null>(null)
  /** Image editor modal state. Null = closed. */
  const [editorOpen, setEditorOpen] = useState(false)
  /** Video editor modal state. Mirrors editorOpen for video kind. */
  const [videoEditorOpen, setVideoEditorOpen] = useState(false)
  /**
   * Right-aside inspector is split into 4 tabs so users aren't scrolling
   * through 11 stacked sections to find a single control. The grouping
   * is concern-driven:
   *   - Content: text, narration timing, scene kind, voice, speed, image
   *   - Style: layout (+ slots), text style, font, colour
   *   - Audio: SFX overrides
   *   - Variants: per-variant override + render of that segment
   * "Content" is the default open tab because narration / image are the
   * fields users touch on every segment.
   */
  type InspectorTab = 'content' | 'style' | 'audio' | 'variants'
  const [tab, setTab] = useState<InspectorTab>('content')

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
      const { path, durationSec, wordBoundaries } = (await res.json()) as {
        path: string
        durationSec: number
        wordBoundaries?: WordBoundary[]
      }
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
        wordBoundaries: wordBoundaries ?? [],
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

  // Color override resolution: variant > segment, merged shallowly so a
  // variant-level tweak on `accent` still inherits the segment-level
  // `primary` (mirrors what the composition's resolveColorOverride does).
  const perVariantColor = activeVariant?.colorOverrideBySegmentId?.[segment.id]
  const segColor = segment.colorOverride
  const resolvedColor: ColorOverride | undefined =
    !perVariantColor && !segColor ? undefined : { ...(segColor ?? {}), ...(perVariantColor ?? {}) }
  const colorScope: 'variant' | 'segment' | 'default' = perVariantColor
    ? 'variant'
    : segColor
      ? 'segment'
      : 'default'
  const colorChannels: Array<keyof ColorOverride> = ['primary', 'accent', 'stroke', 'idle']
  const activeChannels = resolvedColor
    ? colorChannels.filter((c) => typeof resolvedColor[c] === 'string')
    : []

  // Tab bar config — single source of truth for both the rendered
  // strip and the conditional section wrappers below.
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: 'content', label: 'Content' },
    { id: 'style', label: 'Style' },
    { id: 'audio', label: 'Audio' },
    { id: 'variants', label: 'Variants' },
  ]

  return (
    <div className="space-y-4">
      {/* Tab bar — pinned at top of inspector so the user always knows
          which slice of segment state they're editing. Tab labels stay
          short (one word each) so the strip fits comfortably in the
          ~280px aside without wrapping. */}
      <div className="flex border-b text-[11px] uppercase tracking-wide">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex-1 px-2 py-2 font-semibold transition-colors',
              tab === t.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
            )}
          >
            {t.label}
            {tab === t.id ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'content' ? (
        <>
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

      {/* Fade-in / fade-out transitions. Both default to 0 (no fade) so
          legacy storyboards render unchanged; cap at 2s so a 5s segment
          can't be dominated by fades. Storing `undefined` instead of 0
          keeps the storyboard tidy — the schema treats them
          interchangeably. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="segment-fade-in">Fade in (s)</Label>
          <Input
            id="segment-fade-in"
            className="mt-1"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={segment.fadeInSec ?? 0}
            onChange={(e) => {
              const v = Number.parseFloat(e.target.value)
              const next = Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0
              onChange({ fadeInSec: next > 0 ? next : undefined })
            }}
          />
        </div>
        <div>
          <Label htmlFor="segment-fade-out">Fade out (s)</Label>
          <Input
            id="segment-fade-out"
            className="mt-1"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={segment.fadeOutSec ?? 0}
            onChange={(e) => {
              const v = Number.parseFloat(e.target.value)
              const next = Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0
              onChange({ fadeOutSec: next > 0 ? next : undefined })
            }}
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
        </>
      ) : null}

      {tab === 'style' ? (
        <>
      {/* Copy/paste the entire style cluster (layout + slots + text
          style + font + colour) so users can configure one segment
          and clone its look onto others instead of repeating every
          picker by hand. In-memory clipboard, cleared on reload. */}
      <StyleCopyPaste
        segment={segment}
        segmentIndex={segmentIndex}
        activeVariantId={activeVariantId}
        variants={variants ?? []}
        onPaste={(mode, snapshot) => onPasteStyle({ snapshot, mode })}
      />
      <div>
        <Label>Layout</Label>
        <div className="mt-1 space-y-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
              {segment.layoutId ?? 'scene default'}
            </code>
            <LayoutPicker
              currentId={segment.layoutId}
              onApply={(id) => onChange({ layoutId: id })}
              trigger={
                <Button variant="outline" size="sm">
                  <Layers />
                  Change
                </Button>
              }
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Layout decides where the headline, eyebrow, chips, and media
            sit. Without one, the scene falls back to its built-in
            full-bleed rendering.
          </p>
        </div>
      </div>

      {layoutNeedsSlot(segment.layoutId, 'eyebrow') ? (
        <div>
          <Label htmlFor={`eyebrow-${segment.id}`}>Eyebrow</Label>
          <Input
            id={`eyebrow-${segment.id}`}
            className="mt-1"
            value={segment.eyebrow ?? ''}
            maxLength={40}
            placeholder='e.g. "CASE FILE", "ISSUE 04", "BREAKING"'
            onChange={(e) =>
              onChange({ eyebrow: e.target.value || undefined })
            }
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Short uppercase label rendered above the headline. Hard-styled
            by the layout — typography isn't user-controlled in v1.
          </p>
        </div>
      ) : null}

      {layoutNeedsSlot(segment.layoutId, 'chips') ? (
        <div>
          <Label htmlFor={`chips-${segment.id}`}>Chips</Label>
          <Input
            id={`chips-${segment.id}`}
            className="mt-1"
            value={(segment.chips ?? []).join(' · ')}
            placeholder='e.g. "ARRESTED 2024 · 12 COUNTRIES · $1B LOSS"'
            onChange={(e) => {
              // Split on " · " (the same separator we render with) plus
              // a couple of forgiving alternates so users can paste from
              // anywhere.
              const raw = e.target.value
              const chips = raw
                .split(/\s*[·•|]\s*/u)
                .map((s) => s.trim().slice(0, 30))
                .filter(Boolean)
                .slice(0, 5)
              onChange({ chips: chips.length > 0 ? chips : undefined })
            }}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Up to 5 short pills, separated by " · ". Each capped at 30
            characters by the schema.
          </p>
        </div>
      ) : null}

      {layoutNeedsSlot(segment.layoutId, 'fileId') ? (
        <div>
          <Label htmlFor={`fileId-${segment.id}`}>File ID</Label>
          <Input
            id={`fileId-${segment.id}`}
            className="mt-1"
            value={segment.fileId ?? ''}
            maxLength={20}
            placeholder='e.g. "FILE 07", "VOL. 12"'
            onChange={(e) =>
              onChange({ fileId: e.target.value || undefined })
            }
          />
        </div>
      ) : null}

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
              projectId={projectId}
              language={language}
              previewBackground={segment.visuals.background?.path}
              aspect={aspect}
              onUserStyleSaved={onUserStyleSaved}
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
              resolvedStyle={resolvedStyle ?? null}
              aspect={aspect}
              previewBackground={segment.visuals.background?.path}
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
        <Label>Colour</Label>
        <div className="mt-1 space-y-2">
          <div className="flex items-center gap-2">
            {activeChannels.length > 0 ? (
              <div className="flex flex-1 flex-wrap items-center gap-2 rounded-md border bg-muted px-2 py-1.5">
                {activeChannels.map((c) => (
                  <div key={c} className="flex items-center gap-1 text-xs">
                    <span
                      className="size-3.5 rounded-sm border"
                      style={{ background: resolvedColor?.[c] }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{c}</span>
                  </div>
                ))}
              </div>
            ) : (
              <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
                inherits style colours
              </code>
            )}
            <ColorPicker
              current={resolvedColor}
              activeVariantId={activeVariantId}
              onApply={onApplyColor}
              resolvedStyle={resolvedStyle ?? null}
              sampleText={segment.text}
              aspect={aspect}
              previewBackground={segment.visuals.background?.path}
              trigger={
                <Button variant="outline" size="sm">
                  <Palette />
                  Change
                </Button>
              }
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {colorScope === 'variant'
              ? `Pinned in variant ${activeVariantId} only.`
              : colorScope === 'segment'
                ? 'Pinned on this segment across every variant.'
                : 'No overrides — text style colours win.'}
          </p>
        </div>
      </div>
        </>
      ) : null}

      {tab === 'audio' ? (
        <>
      <div>
        <Label>Sound effect</Label>
        <div className="mt-1 space-y-2">
          {segment.sfxOverride ? (
            <div className="space-y-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary">
                Segment override
              </div>
              {segment.sfxOverride.enterSoundId ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Enter</span>
                  <code className="font-mono">{segment.sfxOverride.enterSoundId}</code>
                </div>
              ) : (
                <div className="text-muted-foreground">No enter cue</div>
              )}
              {segment.sfxOverride.perWordSoundId ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Per word</span>
                  <code className="font-mono">{segment.sfxOverride.perWordSoundId}</code>
                </div>
              ) : null}
            </div>
          ) : resolvedStyle?.sfx ? (
            <div className="space-y-1 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                From style {resolvedStyle.name}
              </div>
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
            <p className="text-xs text-muted-foreground">
              {segment.textStyleId
                ? 'This style has no SFX cues.'
                : 'SFX is set by the resolved text style — pick one above to hear cues.'}
            </p>
          )}
          <SfxPicker
            projectId={projectId}
            customSfx={customSfx ?? []}
            override={segment.sfxOverride}
            resolvedFromStyle={resolvedStyle?.sfx ?? undefined}
            onChange={(next) =>
              onChange({ sfxOverride: next ?? undefined })
            }
            onApplyToAll={onApplySfxToAll}
            onCustomSfxChange={onCustomSfxChange}
            trigger={
              <Button variant="outline" size="sm" className="w-full">
                <Volume2 />
                {segment.sfxOverride ? 'Edit SFX override' : 'Override SFX'}
              </Button>
            }
          />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Segment override wins over the resolved style. Adjust master volume in Settings.
        </p>
      </div>
        </>
      ) : null}

      {tab === 'content' ? (
      <div className="space-y-3 rounded-md border bg-secondary/20 p-2">
        <ImageLibrary
          projectId={projectId}
          library={library}
          onLibraryChange={onLibraryChange}
          onApplyToCurrent={(asset) =>
            onChange({ visuals: { ...segment.visuals, background: asset } })
          }
          onEditAndApply={(asset) => {
            // Apply the bare asset first (and clear stale edits from
            // a previously-attached image) so the editor opens against
            // the new background. The user's Apply click then sets
            // backgroundEdits / video knobs via the editor's own
            // onApply callback.
            onChange({
              visuals: { ...segment.visuals, background: asset },
              backgroundEdits: undefined,
            })
            if (asset.kind === 'video') {
              setVideoEditorOpen(true)
            } else {
              setEditorOpen(true)
            }
          }}
          onAutoFillEmpty={onAutoFillEmpty}
          emptySegmentCount={emptySegmentCount}
          hasSelectedSegment
        />
        <div className="border-t pt-2">
          <Label>
            {segment.visuals.background?.kind === 'video'
              ? 'Background video'
              : 'Background image'}
          </Label>
          <div className="mt-1 space-y-2">
            {segment.visuals.background ? (
              <BackgroundThumb
                asset={segment.visuals.background}
                edits={segment.backgroundEdits}
              />
            ) : (
              <p className="text-xs text-muted-foreground">No image set.</p>
            )}
            <div className="flex items-center gap-2">
              <ImagePicker
                defaultQuery={segment.text.split(/\s+/).slice(0, 4).join(' ')}
                orientation={inferOrientation(aspect)}
                onSelect={(asset: AssetRef) =>
                  onChange({ visuals: { ...segment.visuals, background: asset } })
                }
                trigger={
                  <Button variant="outline" size="sm" className="flex-1">
                    <ImageIcon />
                    {segment.visuals.background ? 'Swap' : 'Find image'}
                  </Button>
                }
              />
              {segment.visuals.background ? (
                segment.visuals.background.kind === 'video' ? (
                  // Video branch: edit knobs live in a separate dialog;
                  // ON indicator surfaces when any of the six video
                  // fields is non-default.
                  (() => {
                    const hasVideoEdits =
                      segment.videoTrim !== undefined ||
                      segment.videoLoop === false ||
                      segment.videoMuted === false ||
                      (segment.videoVolume !== undefined && segment.videoVolume !== 1) ||
                      (segment.videoAudioFadeInSec ?? 0) > 0 ||
                      (segment.videoAudioFadeOutSec ?? 0) > 0 ||
                      (segment.videoPlaybackRate !== undefined &&
                        segment.videoPlaybackRate !== 1) ||
                      (segment.videoFit !== undefined && segment.videoFit !== 'cover') ||
                      (segment.videoAlign !== undefined && segment.videoAlign !== 'center') ||
                      segment.backgroundEdits?.flipH === true ||
                      segment.backgroundEdits?.flipV === true
                    return (
                      <Button
                        variant={hasVideoEdits ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1"
                        onClick={() => setVideoEditorOpen(true)}
                        title="Trim, loop, mute, speed, fit"
                      >
                        <Crop />
                        Edit
                        {hasVideoEdits ? (
                          <span className="ml-1 rounded bg-primary-foreground/20 px-1 text-[9px]">
                            ON
                          </span>
                        ) : null}
                      </Button>
                    )
                  })()
                ) : (
                  <Button
                    variant={segment.backgroundEdits ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditorOpen(true)}
                    title={
                      segment.backgroundEdits
                        ? 'Edit current adjustments'
                        : 'Crop / rotate / overlay'
                    }
                  >
                    <Crop />
                    Edit
                    {segment.backgroundEdits ? (
                      <span className="ml-1 rounded bg-primary-foreground/20 px-1 text-[9px]">
                        ON
                      </span>
                    ) : null}
                  </Button>
                )
              ) : null}
            </div>
          </div>
        </div>
        <ImageEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          asset={segment.visuals.background ?? null}
          initialEdits={segment.backgroundEdits}
          projectAspect={aspect}
          onApply={(nextEdits) => onChange({ backgroundEdits: nextEdits })}
        />
        {segment.visuals.background?.kind === 'video' ? (
          <VideoEditorDialog
            open={videoEditorOpen}
            onOpenChange={setVideoEditorOpen}
            asset={segment.visuals.background}
            initial={videoEditorInitial(segment)}
            projectAspect={aspect}
            onApply={(next) => {
              // Stitch flip flags onto backgroundEdits — that's where
              // KenBurns reads them. We collapse the whole edits object
              // back to undefined when nothing is set, so a "no edits"
              // segment doesn't bloat storyboard.json.
              const prevEdits = segment.backgroundEdits
              const nextFlipH = next.flipH ?? false
              const nextFlipV = next.flipV ?? false
              const hasOtherEdits =
                prevEdits !== undefined &&
                (prevEdits.crop !== undefined ||
                  (prevEdits.rotateDeg ?? 0) !== 0 ||
                  (prevEdits.vignette ?? 0) !== 0 ||
                  prevEdits.overlay !== undefined)
              const nextBackgroundEdits =
                !nextFlipH && !nextFlipV && !hasOtherEdits
                  ? undefined
                  : {
                      ...(prevEdits ?? { rotateDeg: 0, flipH: false, flipV: false, vignette: 0 }),
                      flipH: nextFlipH,
                      flipV: nextFlipV,
                    }
              onChange({
                videoTrim: next.videoTrim,
                videoLoop: next.videoLoop,
                videoMuted: next.videoMuted,
                videoVolume: next.videoVolume,
                videoAudioFadeInSec: next.videoAudioFadeInSec,
                videoAudioFadeOutSec: next.videoAudioFadeOutSec,
                videoPlaybackRate: next.videoPlaybackRate,
                videoFit: next.videoFit,
                videoAlign: next.videoAlign,
                backgroundEdits: nextBackgroundEdits,
              })
            }}
          />
        ) : null}
      </div>
      ) : null}

      {tab === 'variants' ? (
        <div className="space-y-2">
          {variants && variants.length > 0 ? (
            <>
              <p className="text-[10px] text-muted-foreground">
                Each variant declares its own text-style mapping per scene
                kind. Pick a variant to preview that mix in the player;
                use the variant-scoped pickers in the Style tab to pin a
                style on this segment for one variant only.
              </p>
              <ul className="space-y-1.5">
                {variants.map((v) => (
                  <li
                    key={v.id}
                    className={cn(
                      'rounded-md border px-3 py-2 text-xs',
                      activeVariantId === v.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {v.id}
                        {v.label ? ` · ${v.label}` : ''}
                      </span>
                      {activeVariantId === v.id ? (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-primary">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {Object.entries(v.textStyleBySceneKind ?? {})
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' · ') || 'No scene-kind mapping declared.'}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No variants declared. Add variants via Claude orchestrator
              or by editing the storyboard directly to render multiple
              looks of the same project.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function inferOrientation(aspect: Project['aspect']): 'landscape' | 'portrait' | 'square' {
  if (aspect === '16:9') return 'landscape'
  if (aspect === '1:1') return 'square'
  return 'portrait'
}

/**
 * Tiny preview tile for a segment's background image. Re-applies the
 * same CSS transforms the renderer will use, so users see the cropped
 * + rotated thumbnail at a glance instead of the raw photo. Kept to
 * ~max-h-40 so it doesn't dominate the inspector.
 */
function BackgroundThumb({
  asset,
  edits,
}: {
  asset: AssetRef
  edits?: BackgroundEdits
}) {
  const url = assetUrl(asset.path)
  const transforms: string[] = []
  if (edits?.rotateDeg) transforms.push(`rotate(${edits.rotateDeg}deg)`)
  if (edits?.flipH) transforms.push('scaleX(-1)')
  if (edits?.flipV) transforms.push('scaleY(-1)')
  let cropScale = 1
  let objectPosition: string | undefined
  if (edits?.crop) {
    cropScale = 100 / Math.max(edits.crop.widthPct, 1)
    objectPosition = `${edits.crop.xPct + edits.crop.widthPct / 2}% ${
      edits.crop.yPct + edits.crop.heightPct / 2
    }%`
  }
  return (
    <div className="relative h-40 overflow-hidden rounded-md border bg-black/40">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url ?? ''}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition,
          transform: `${transforms.join(' ')} scale(${cropScale})`.trim(),
          transformOrigin: 'center center',
          display: 'block',
        }}
      />
      {edits?.overlay && edits.overlay.opacity > 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: edits.overlay.color,
            opacity: edits.overlay.opacity,
            mixBlendMode: edits.overlay.blendMode,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {edits?.vignette && edits.vignette > 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,${edits.vignette}) 100%)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  )
}
