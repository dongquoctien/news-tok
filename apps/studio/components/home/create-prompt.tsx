'use client'

import { useEffect, useRef, useState } from 'react'
import { Link2, Loader2, Sparkles, Type, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Source = { type: 'url' | 'text'; value: string }
type Language = 'vi' | 'en'
type Aspect = '9:16' | '16:9' | '1:1'

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
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        body: JSON.stringify({ source, language, aspect }),
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={running}
          placeholder="Paste a link, drop a .txt file, or type the article text…"
          rows={4}
          className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
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
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              disabled={running}
              className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed"
            >
              <option value="vi">VI</option>
              <option value="en">EN</option>
            </select>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value as Aspect)}
              disabled={running}
              className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed"
            >
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
            </select>
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
      </div>

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
