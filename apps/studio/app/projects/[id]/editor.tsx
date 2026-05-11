'use client'

import { useCallback, useEffect, useState } from 'react'
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
  Save,
} from 'lucide-react'
import {
  DEFAULT_VOICES,
  type AssetRef,
  type Project,
  type Segment,
} from '@news-tok/shared/schema'
import { PlayerPane } from '@/components/studio/player-pane'
import { VoicePicker } from '@/components/studio/voice-picker'
import { ImagePicker } from '@/components/studio/image-picker'
import { MusicPicker } from '@/components/studio/music-picker'
import { assetUrl } from '@/lib/asset-url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'saving' | 'saved' | 'error'
type RenderStatus = 'idle' | 'running' | 'completed' | 'failed'

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

  const selected = project.segments.find((s) => s.id === selectedId) ?? null

  const updateSegment = useCallback(
    (id: string, patch: Partial<Segment>) => {
      setProject((p) => ({
        ...p,
        segments: p.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        updatedAt: new Date().toISOString(),
      }))
    },
    []
  )

  const updateProject = useCallback((patch: Partial<Project>) => {
    setProject((p) => ({ ...p, ...patch, updatedAt: new Date().toISOString() }))
  }, [])

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
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1200)
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }, [project])

  const triggerRender = useCallback(async () => {
    setRenderStatus('running')
    setRenderProgress(0)
    setRenderError(null)
    try {
      const res = await fetch(`/api/projects/${project.id}/render?scope=full`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      setRenderStatus('failed')
      setRenderError(err instanceof Error ? err.message : String(err))
    }
  }, [project.id])

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
        }
        setRenderProgress(job.progress)
        if (job.status === 'completed') {
          setRenderStatus('completed')
          setTimeout(() => setRenderStatus('idle'), 3000)
        } else if (job.status === 'failed') {
          setRenderStatus('failed')
          setRenderError(job.error ?? 'render failed')
        }
      } catch {
        // Network blip — try again on next tick.
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [renderStatus, project.id])

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Projects
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{project.title}</h1>
          <p className="text-xs text-muted-foreground">
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
        <div className="flex items-center gap-2">
          <select
            value={project.exportPreset}
            onChange={(e) =>
              updateProject({ exportPreset: e.target.value as Project['exportPreset'] })
            }
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            aria-label="Export preset"
          >
            <option value="standard">Standard (30fps)</option>
            <option value="tiktok">TikTok (60fps)</option>
            <option value="youtube-shorts">YouTube Shorts</option>
            <option value="reels">Reels</option>
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
          <Button
            variant="outline"
            size="sm"
            onClick={save}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Save />
            )}
            {saveStatus === 'saved' ? 'Saved' : 'Save'}
          </Button>
          <Button
            size="sm"
            onClick={triggerRender}
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
        </div>
      </header>

      {(saveError || renderError) && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-xs text-destructive">
          {saveError ?? renderError}
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
          <PlayerPane project={project} />
        </section>

        <aside className="overflow-y-auto border-l p-4">
          {selected ? (
            <SegmentEditor
              segment={selected}
              language={project.language}
              aspect={project.aspect}
              onChange={(patch) => updateSegment(selected.id, patch)}
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
  onChange,
}: {
  segment: Segment
  language: Project['language']
  aspect: Project['aspect']
  onChange: (patch: Partial<Segment>) => void
}) {
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
            className="mt-1"
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
