'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
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

type Job = {
  jobId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  projectId?: string
  step?: string
  error?: string
}

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
          placeholder="Paste a link, drop a .txt file, or type the article text…"
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
              Auto-detect: paste URL or 20+ chars of text
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
              title="Tweak variants, total duration, segment count"
            >
              <Sliders />
              Advanced
              {advancedTouched ? (
                <span className="ml-0.5 inline-block size-1.5 rounded-full bg-primary" />
              ) : null}
              {advancedOpen ? <ChevronUp /> : <ChevronDown />}
            </Button>
            {running ? (
              <Button variant="outline" size="sm" onClick={cancel}>
                <X />
                Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={!source}>
                <Sparkles />
                Generate
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
              label="Style variants"
              hint="More variants render multiple looks (A/B/C) for the same content. 1 is fastest."
              min={1}
              max={3}
              step={1}
              value={variants}
              onChange={(n) => setVariants(n as Variants)}
              format={(n) =>
                n === 1
                  ? '1 (only A)'
                  : n === 2
                    ? '2 (A + B)'
                    : '3 (A + B + C)'
              }
              disabled={running}
            />
            <SliderRow
              label="Max duration"
              hint="Hard cap on total video length. The planner aims for the article's natural length but won't exceed this."
              min={DURATION_MIN_SEC}
              max={DURATION_MAX_SEC}
              step={5}
              value={maxDurationSec}
              onChange={setMaxDurationSec}
              format={(n) => `${n}s`}
              disabled={running}
            />
            <SliderRow
              label="Max segments"
              hint="Total intro + body + outro count. Higher = more beats but each one is shorter."
              min={SEGMENTS_MIN}
              max={SEGMENTS_MAX}
              step={1}
              value={maxSegments}
              onChange={setMaxSegments}
              format={(n) => `${n}`}
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
          <span>Try a source:</span>
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

      {running ? (
        <div className="flex items-center gap-2 rounded-md border bg-card px-4 py-3 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span className="text-muted-foreground">{job?.step ?? 'Working…'}</span>
        </div>
      ) : job?.status === 'failed' ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Job failed: {job.error ?? 'unknown error'}
        </div>
      ) : job?.status === 'cancelled' ? (
        <div className="rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Cancelled.
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
