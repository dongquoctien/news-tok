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

/** Caps and defaults for the Advanced panel sliders. Must stay in sync
 *  with apps/studio/app/api/orchestrate/route.ts — the API clamps to
 *  the same limits and falls back to the same defaults. */
const VARIANTS_DEFAULT: Variants = 1
const DURATION_DEFAULT_SEC = 90
const DURATION_MIN_SEC = 20
const DURATION_MAX_SEC = 120
const SEGMENTS_DEFAULT = 7
const SEGMENTS_MIN = 3
const SEGMENTS_MAX = 15

type Phase =
  | 'starting'
  | 'extract'
  | 'research'
  | 'plan'
  | 'assets'
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
  { phase: 'research', label: 'Chọn phong cách thị giác' },
  { phase: 'plan', label: 'Lên kịch bản từng đoạn' },
  { phase: 'assets', label: 'Tìm ảnh, nhạc & tạo giọng đọc' },
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
  const [variants, setVariants] = useState<Variants>(VARIANTS_DEFAULT)
  const [maxDurationSec, setMaxDurationSec] = useState<number>(DURATION_DEFAULT_SEC)
  const [maxSegments, setMaxSegments] = useState<number>(SEGMENTS_DEFAULT)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Surface "advanced tweaked" so the trigger badge shows the user is
  // running with non-default limits. Helps prevent the silent "why is
  // my video only 30s" surprise.
  const advancedTouched =
    variants !== VARIANTS_DEFAULT ||
    maxDurationSec !== DURATION_DEFAULT_SEC ||
    maxSegments !== SEGMENTS_DEFAULT

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
