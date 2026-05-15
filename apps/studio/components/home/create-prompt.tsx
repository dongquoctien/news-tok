'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Link2,
  Loader2,
  Sliders,
  Sparkles,
  Type,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** Curated starter URLs the user can click to fill the input. Picked
 *  from sources we know `extractArticle` handles cleanly so the demo
 *  always succeeds. */
const STARTER_URLS: Array<{ label: string; url: string }> = [
  { label: 'VnExpress', url: 'https://vnexpress.net/' },
  { label: 'NLD', url: 'https://nld.com.vn/' },
  { label: 'Báo Văn Hóa', url: 'https://baovanhoa.vn/' },
]

type Source = { type: 'url' | 'text'; value: string }
type Language = 'vi' | 'en'
type Aspect = '9:16' | '16:9' | '1:1'
type Variants = 1 | 2 | 3

/** Length + density presets the user picks before any fine-tune. Each
 *  preset sets `maxDurationSec` + `maxSegments` to a combo that maps
 *  cleanly to a real-world short-video format. The numbers below come
 *  from the platform sweet-spots:
 *
 *   - 'short-hook' — TikTok native (≤30s = best retention curve);
 *      3-4 beats means 1 hook + 2-3 facts.
 *   - 'standard'   — TikTok / IG Reels / YT Shorts all fit; 45s is the
 *      retention max where viewers consistently finish; 5-6 beats is
 *      "1 hook + body + outro" without padding.
 *   - 'explainer'  — Right at the YouTube Shorts 60s cap; 6-8 beats
 *      lets news context land properly. Past 60s you lose the Shorts
 *      shelf algorithm.
 *
 *  Each preset also pins `perSegmentTargetSec`, which the orchestrator
 *  uses as the "aim for ~Ns per beat" instruction. Without that pin,
 *  AI would default to `Math.round(maxDur/maxSeg)` which produces
 *  too-long beats for short formats and too-short beats for explainer
 *  formats. */
const LENGTH_PRESETS = [
  {
    id: 'short-hook',
    label: 'Short hook',
    description: '20–30s · 3–4 beats',
    tagline: 'TikTok native, snappy',
    maxDurationSec: 30,
    maxSegments: 4,
    perSegmentTargetSec: 6,
  },
  {
    id: 'standard',
    label: 'Standard reel',
    description: '30–45s · 5–6 beats',
    tagline: 'Recommended — fits every major platform',
    maxDurationSec: 45,
    maxSegments: 6,
    perSegmentTargetSec: 7,
  },
  {
    id: 'explainer',
    label: 'Explainer',
    description: '45–60s · 6–8 beats',
    tagline: 'YT Shorts max, more context',
    maxDurationSec: 60,
    maxSegments: 8,
    perSegmentTargetSec: 7,
  },
] as const

type PresetId = (typeof LENGTH_PRESETS)[number]['id']
const DEFAULT_PRESET_ID: PresetId = 'standard'

/** Hard caps for the fine-tune sliders. Wider than any individual
 *  preset so power users can deviate but still inside the limits the
 *  backend route enforces. Must stay in sync with LIMITS in
 *  apps/studio/app/api/orchestrate/route.ts. */
const VARIANTS_DEFAULT: Variants = 1
const DURATION_MIN_SEC = 15
const DURATION_MAX_SEC = 90
const SEGMENTS_MIN = 3
const SEGMENTS_MAX = 12

/** Per-platform hard caps used by the inline compatibility banner.
 *  Source: each platform's developer / creator docs as of 2026-05.
 *  YouTube Shorts is the strictest at 60s — videos longer than that
 *  get rejected from the Shorts shelf and uploaded as regular videos,
 *  which wrecks discovery for short-form-focused content. */
const PLATFORM_LIMITS: Array<{ id: string; label: string; maxSec: number }> = [
  { id: 'yt-shorts', label: 'YouTube Shorts', maxSec: 60 },
  { id: 'tiktok', label: 'TikTok', maxSec: 180 },
  { id: 'ig-reels', label: 'IG Reels', maxSec: 90 },
  { id: 'fb-reels', label: 'FB Reels', maxSec: 90 },
]

type Phase =
  | 'starting'
  | 'extract'
  | 'collect-media'
  | 'research'
  | 'plan'
  | 'assets'
  | 'finalize'
  | 'render'
  | 'done'

type Job = {
  jobId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  projectId?: string
  step?: string
  phase?: Phase
  willRender?: boolean
  error?: string
}

/** Ordered phases shown in the loading checklist. Mirrors
 *  OrchestratePhase in apps/studio/lib/orchestrate-jobs.ts. The
 *  'render' phase is hidden when the job was started with
 *  skipRender: true (the home default). */
const PHASE_ORDER: ReadonlyArray<{
  phase: Phase
  label: string
}> = [
  { phase: 'starting', label: 'Khởi động AI' },
  { phase: 'extract', label: 'Đọc bài báo' },
  { phase: 'collect-media', label: 'Lấy media từ bài báo cho Library' },
  { phase: 'research', label: 'Chọn phong cách thị giác' },
  { phase: 'plan', label: 'Lên kịch bản từng đoạn' },
  { phase: 'assets', label: 'Tìm ảnh, nhạc & tạo giọng đọc' },
  { phase: 'finalize', label: 'Xây dựng bố cục và điều chỉnh âm thanh' },
  { phase: 'render', label: 'Dựng video hoàn chỉnh' },
  { phase: 'done', label: 'Mở Studio' },
]

function detectSource(raw: string): Source | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\/\S+$/i.test(trimmed)) return { type: 'url', value: trimmed }
  if (trimmed.length < 20) return null
  return { type: 'text', value: trimmed }
}

function sourceHint(source: Source | null): { icon: typeof Link2; label: string } | null {
  if (!source) return null
  if (source.type === 'url') {
    try {
      const host = new URL(source.value).hostname.replace(/^www\./, '')
      return { icon: Link2, label: `URL · ${host}` }
    } catch {
      return { icon: Link2, label: 'URL' }
    }
  }
  return { icon: Type, label: `Text · ${source.value.length.toLocaleString()} chars` }
}

export function CreatePrompt() {
  const [value, setValue] = useState('')
  const [language, setLanguage] = useState<Language>('vi')
  const [aspect, setAspect] = useState<Aspect>('9:16')
  // Preset is the user's primary control — selecting one writes
  // matching values into maxDurationSec + maxSegments. Fine-tune
  // sliders below can then deviate from the preset; we track the
  // chosen presetId separately so the cards keep showing the right
  // active state even after the user has tweaked individual numbers.
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET_ID)
  const defaultPreset =
    LENGTH_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
  const [variants, setVariants] = useState<Variants>(VARIANTS_DEFAULT)
  const [maxDurationSec, setMaxDurationSec] = useState<number>(
    defaultPreset.maxDurationSec
  )
  const [maxSegments, setMaxSegments] = useState<number>(
    defaultPreset.maxSegments
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // The active preset (if any) is identified by matching the current
  // duration + segments against each preset definition. If the user
  // has tweaked Fine-tune sliders the match goes null and the cards
  // de-highlight — but the Fine-tune block stays anchored to the last
  // explicitly-chosen `presetId` for the perSegmentTargetSec hint.
  const matchingPreset =
    LENGTH_PRESETS.find(
      (p) =>
        p.maxDurationSec === maxDurationSec && p.maxSegments === maxSegments
    ) ?? null

  /** Apply a preset: writes its numbers into the slider state AND
   *  records which preset is active. */
  const applyPreset = (id: PresetId) => {
    const p = LENGTH_PRESETS.find((x) => x.id === id)
    if (!p) return
    setPresetId(id)
    setMaxDurationSec(p.maxDurationSec)
    setMaxSegments(p.maxSegments)
  }

  /** Per-segment beat seconds derived from current sliders. Surfaces
   *  in the compat banner so the user can see whether their custom
   *  combo would feel snappy (~4s) or sleepy (>10s). */
  const perSegmentSec = Math.max(
    1,
    Math.round((maxDurationSec / Math.max(maxSegments, 1)) * 10) / 10
  )

  /** Which target platforms accept this length? Drives the inline
   *  compat banner. Anything > 60s loses YouTube Shorts; > 90s loses
   *  IG / FB Reels too. */
  const platformFit = PLATFORM_LIMITS.map((pl) => ({
    ...pl,
    fits: maxDurationSec <= pl.maxSec,
  }))

  // "Advanced tweaked" is now derived from whether the current
  // sliders deviate from the active preset's defaults, OR variants
  // isn't the default — same idea, more honest about what counts as
  // "tweaked" once presets exist.
  const advancedTouched =
    variants !== VARIANTS_DEFAULT || matchingPreset === null

  // Auto-grow textarea: reset height first so shrinking back works, then
  // expand to fit scrollHeight. Capped at ~14 lines so a giant paste
  // doesn't push the form off-screen — beyond that the textarea scrolls
  // internally.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxPx = 320
    el.style.height = `${Math.min(maxPx, el.scrollHeight)}px`
  }, [value])

  const source = detectSource(value)
  const hint = sourceHint(source)
  const running = job?.status === 'running'

  // On mount, check if there is already a running job (e.g. user reloaded the page).
  useEffect(() => {
    let cancelled = false
    void fetch('/api/orchestrate')
      .then((r) => r.json())
      .then((data: { running?: Job }) => {
        if (cancelled) return
        if (data.running) setJob(data.running)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Poll job status while running.
  useEffect(() => {
    if (!job || job.status !== 'running') {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      return
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/orchestrate?jobId=${job.jobId}`, { cache: 'no-store' })
        if (res.status === 404) {
          // Job file was deleted mid-poll (data dir wiped, mock
          // cleanup, etc). Stop polling and clear the running
          // state — otherwise the loop would 404 forever.
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setJob(null)
          return
        }
        if (!res.ok) return
        const next = (await res.json()) as Job
        setJob(next)
        if (next.status === 'completed' && next.projectId) {
          // Use a hard navigation instead of router.push — the App Router
          // sometimes drops navigations issued from outside React's event
          // loop (e.g. from a setInterval callback) and silently leaves the
          // user on the home page after the job finishes.
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          window.location.assign(`/projects/${next.projectId}`)
        }
      } catch {
        /* keep polling */
      }
    }, 1500)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [job])

  const submit = async () => {
    if (!source) return
    setError(null)
    // Collapse the Advanced panel on submit so the form shrinks back
    // and the loading checklist below isn't pushed off-screen by the
    // extra sliders. User can re-open from the trigger if needed.
    setAdvancedOpen(false)
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source,
          language,
          aspect,
          variants,
          maxDurationSec,
          maxSegments,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error ?? `HTTP ${res.status}`)
        if (body?.job) setJob(body.job)
        return
      }
      setJob({ jobId: body.jobId, status: 'running' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const cancel = async () => {
    if (!job) return
    try {
      await fetch(`/api/orchestrate?jobId=${job.jobId}`, { method: 'DELETE' })
      setJob({ ...job, status: 'cancelled' })
    } catch {
      /* ignore */
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.size > 1_000_000) {
      setError('File too large (max 1 MB of article text)')
      return
    }
    const text = await file.text()
    setValue(text)
  }

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          'rounded-lg border bg-card p-4 shadow-sm transition-colors',
          running && 'opacity-60'
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={running}
          placeholder="Dán link bài báo, thả file .txt, hoặc gõ nội dung…"
          rows={2}
          className="block w-full resize-none overflow-y-auto bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hint ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
              <hint.icon className="size-3" />
              {hint.label}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Tự nhận diện: dán link hoặc gõ ít nhất 20 ký tự
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as Language)}
              disabled={running}
            >
              <SelectTrigger className="w-[68px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">VI</SelectItem>
                <SelectItem value="en">EN</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={aspect}
              onValueChange={(v) => setAspect(v as Aspect)}
              disabled={running}
            >
              <SelectTrigger className="w-[82px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="9:16">9:16</SelectItem>
                <SelectItem value="16:9">16:9</SelectItem>
                <SelectItem value="1:1">1:1</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdvancedOpen((o) => !o)}
              disabled={running}
              aria-expanded={advancedOpen}
              aria-controls="create-prompt-advanced"
              title="Tinh chỉnh số kiểu video, thời lượng tối đa, số đoạn"
            >
              <Sliders />
              Tinh chỉnh
              {advancedTouched ? (
                <span className="ml-0.5 inline-block size-1.5 rounded-full bg-primary" />
              ) : null}
              {advancedOpen ? <ChevronUp /> : <ChevronDown />}
            </Button>
            {running ? (
              <Button variant="outline" size="sm" onClick={cancel}>
                <X />
                Huỷ
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={!source}>
                <Sparkles />
                Tạo video
              </Button>
            )}
          </div>
        </div>

        {advancedOpen ? (
          <div
            id="create-prompt-advanced"
            className="mt-4 space-y-4 border-t pt-4"
          >
            {/* Preset cards — the primary control. Each card sets
                duration + segments + per-beat target in one click.
                The card visually highlights when its (duration,
                segments) tuple matches the current sliders. */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Định dạng video
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {LENGTH_PRESETS.map((p) => {
                  const active =
                    matchingPreset?.id === p.id ||
                    (matchingPreset === null && p.id === presetId)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      disabled={running}
                      className={cn(
                        'relative rounded-md border p-3 text-left transition-colors',
                        // Active state: bump ring + bg + thicker primary
                        // border so the chosen card stays visible in
                        // dark-mode where a 1px primary border is almost
                        // invisible against bg-card.
                        active
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                          : 'border-input bg-card hover:bg-secondary/50',
                        running ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute right-2 top-2 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                        >
                          ✓
                        </span>
                      ) : null}
                      <div className="text-sm font-semibold">{p.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.description}
                      </div>
                      <div className="mt-2 text-[10px] text-muted-foreground/80">
                        {p.tagline}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Inline compatibility banner — tells the user which
                platforms accept the current length. Updates live as
                presets change or fine-tune sliders move. Most
                important warning: YouTube Shorts caps at 60s; videos
                past that fall off the Shorts shelf. */}
            <PlatformCompatBanner
              platforms={platformFit}
              durationSec={maxDurationSec}
              segmentCount={maxSegments}
              perSegmentSec={perSegmentSec}
            />

            {/* Fine-tune — collapsed by default, opens when the user
                wants to deviate from a preset. The variant count
                lives here too because it's an orthogonal axis (style
                count, not length). */}
            <FineTuneBlock
              variants={variants}
              setVariants={setVariants}
              maxDurationSec={maxDurationSec}
              setMaxDurationSec={setMaxDurationSec}
              maxSegments={maxSegments}
              setMaxSegments={setMaxSegments}
              running={running}
            />
          </div>
        ) : null}
      </div>

      {/* Starter chips — only when the textarea is empty + no job in
          flight, so the home is helpful for first-time users without
          getting in the way once they're typing or watching a render. */}
      {!value && !running && !job ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>Thử ngay:</span>
          {STARTER_URLS.map((s) => (
            <button
              key={s.url}
              type="button"
              onClick={() => setValue(s.url)}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
            >
              <Link2 className="size-3" />
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      {running ? <PhaseTimeline job={job!} /> : null}

      {job?.status === 'failed' ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Có lỗi xảy ra: {job.error ?? 'không rõ nguyên nhân'}
        </div>
      ) : null}

      {job?.status === 'cancelled' ? (
        <div className="rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Đã huỷ.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Loading timeline shown while Claude orchestrates the job. Renders
 * each phase as a checklist row: done (✓), current (spinner + step
 * text), or pending (○). Renders the `render` row only when the job
 * was started without `skipRender`, so the home flow (which skips
 * render by design) doesn't show a step that will never fire.
 */
function PhaseTimeline({ job }: { job: Job }) {
  const currentIdx = job.phase
    ? PHASE_ORDER.findIndex((p) => p.phase === job.phase)
    : 0
  const phases = job.willRender
    ? PHASE_ORDER
    : PHASE_ORDER.filter((p) => p.phase !== 'render')

  return (
    <div className="rounded-md border bg-card p-4 text-left text-sm">
      <ul className="space-y-2.5">
        {phases.map(({ phase, label }) => {
          const orderIdx = PHASE_ORDER.findIndex((p) => p.phase === phase)
          const state =
            orderIdx < currentIdx
              ? 'done'
              : orderIdx === currentIdx
                ? 'running'
                : 'pending'
          return (
            <li key={phase} className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center',
                  state === 'done' && 'text-emerald-600 dark:text-emerald-400',
                  state === 'running' && 'text-primary',
                  state === 'pending' && 'text-muted-foreground/50'
                )}
                aria-hidden
              >
                {state === 'done' ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : state === 'running' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Circle className="size-3" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm leading-tight',
                    state === 'pending'
                      ? 'text-muted-foreground/70'
                      : state === 'running'
                        ? 'font-medium text-foreground'
                        : 'text-foreground'
                  )}
                >
                  {label}
                </p>
                {state === 'running' && job.step ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{job.step}</p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * One row of the Advanced panel: label + native range slider + live
 * numeric readout + hint. Native `<input type="range">` is enough here
 * — we don't need tick marks, dual handles, or keyboard-only fine
 * tuning, and pulling in a Radix dependency for three throwaway
 * sliders would be overkill.
 */
function SliderRow({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
  format,
  disabled,
}: {
  label: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  onChange: (n: number) => void
  format: (n: number) => string
  disabled?: boolean
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={label}
      />
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Inline compatibility banner. Shows the user (a) one-line summary of
 * the current length + density, (b) which target platforms accept
 * this length, and (c) any warnings — chiefly YouTube Shorts > 60s
 * losing the Shorts shelf. The banner is purely informational; it
 * never blocks submission, since the user might legitimately want a
 * long-form variant that they'll trim later.
 */
function PlatformCompatBanner({
  platforms,
  durationSec,
  segmentCount,
  perSegmentSec,
}: {
  platforms: Array<{ id: string; label: string; maxSec: number; fits: boolean }>
  durationSec: number
  segmentCount: number
  perSegmentSec: number
}) {
  const fitting = platforms.filter((p) => p.fits)
  const dropped = platforms.filter((p) => !p.fits)
  const pace =
    perSegmentSec <= 4
      ? 'rất snappy'
      : perSegmentSec <= 6
        ? 'snappy'
        : perSegmentSec <= 8
          ? 'cân bằng'
          : 'chậm rãi'

  return (
    <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">
          ≤{durationSec}s · {segmentCount} đoạn · ~{perSegmentSec}s/đoạn
        </span>
        <span className="text-muted-foreground">({pace})</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {fitting.length > 0 ? (
          <>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              OK:
            </span>
            {fitting.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300"
              >
                {p.label}
              </span>
            ))}
          </>
        ) : null}
        {dropped.length > 0 ? (
          <>
            <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Vượt:
            </span>
            {dropped.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300"
                title={`${p.label} caps at ${p.maxSec}s`}
              >
                ⚠ {p.label} ≤{p.maxSec}s
              </span>
            ))}
          </>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Collapsible fine-tune block. Holds the three sliders from the old
 * design (variants, duration, segments) but opens only when the user
 * explicitly clicks "Fine-tune" — most users will just pick a preset
 * and move on. Wrapping `<details>` natively handles the toggle so
 * we don't need extra state.
 */
function FineTuneBlock({
  variants,
  setVariants,
  maxDurationSec,
  setMaxDurationSec,
  maxSegments,
  setMaxSegments,
  running,
}: {
  variants: Variants
  setVariants: (n: Variants) => void
  maxDurationSec: number
  setMaxDurationSec: (n: number) => void
  maxSegments: number
  setMaxSegments: (n: number) => void
  running: boolean
}) {
  return (
    <details className="group rounded-md border bg-card">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-medium">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Sliders className="size-3.5" />
          Tinh chỉnh thêm
        </span>
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t px-3 pb-3 pt-3">
        <SliderRow
          label="Số kiểu video"
          hint="Mỗi kiểu (A/B/C) là một bộ font + màu khác nhau cho cùng nội dung. Chọn 1 cho nhanh; chọn 3 nếu muốn so sánh phong cách."
          min={1}
          max={3}
          step={1}
          value={variants}
          onChange={(n) => setVariants(n as Variants)}
          format={(n) =>
            n === 1
              ? '1 kiểu (A)'
              : n === 2
                ? '2 kiểu (A + B)'
                : '3 kiểu (A + B + C)'
          }
          disabled={running}
        />
        <SliderRow
          label="Thời lượng tối đa"
          hint="Giới hạn cứng độ dài video. AI sẽ chọn thời lượng phù hợp với bài báo nhưng không vượt quá ngưỡng này."
          min={DURATION_MIN_SEC}
          max={DURATION_MAX_SEC}
          step={5}
          value={maxDurationSec}
          onChange={setMaxDurationSec}
          format={(n) => `${n} giây`}
          disabled={running}
        />
        <SliderRow
          label="Số đoạn"
          hint="Tổng số đoạn (mở bài + thân bài + kết bài). Càng nhiều thì mỗi đoạn càng ngắn."
          min={SEGMENTS_MIN}
          max={SEGMENTS_MAX}
          step={1}
          value={maxSegments}
          onChange={setMaxSegments}
          format={(n) => `${n} đoạn`}
          disabled={running}
        />
      </div>
    </details>
  )
}
