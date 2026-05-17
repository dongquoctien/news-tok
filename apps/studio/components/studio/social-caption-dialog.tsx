'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { Platform, SocialCaptionResult } from '@news-tok/shared/social'
import type { SanitizeReplacement } from '@news-tok/shared/caption-sanitize'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type PlatformMeta = {
  label: string
  color: string
  charBudget: number
  tip: string
}

/**
 * Per-platform sweet spot — the length range that actually performs
 * well on each platform. `charBudget` is the absolute upper bound
 * (used as a hard fail threshold); `targetMax` is the recommended
 * ceiling for organic reach. The dialog warns when the baseline
 * exceeds `targetMax` and prompts the user to ask Claude CLI to
 * rewrite it shorter.
 */
const PLATFORMS: Record<
  Platform,
  PlatformMeta & { targetMax: number }
> = {
  tiktok: {
    label: 'TikTok',
    color: 'bg-pink-500/20 text-pink-700 border-pink-500/30 dark:text-pink-300',
    charBudget: 2200,
    targetMax: 250,
    tip: 'Sweet spot 120–250 chars. Hook ngắn + 1 câu drama + ≤6 hashtag.',
  },
  facebook: {
    label: 'Facebook',
    color: 'bg-blue-500/20 text-blue-700 border-blue-500/30 dark:text-blue-300',
    charBudget: 63206,
    targetMax: 800,
    tip: 'Sweet spot 400–800 chars. Kể chuyện, kết bằng câu hỏi mở.',
  },
  instagram: {
    label: 'Instagram',
    color: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
    charBudget: 2200,
    targetMax: 500,
    tip: 'Sweet spot 250–500 chars. Emoji hook + arrow bullets + hashtag block.',
  },
  youtube: {
    label: 'YouTube',
    color: 'bg-red-500/20 text-red-700 border-red-500/30 dark:text-red-300',
    charBudget: 5000,
    targetMax: 1500,
    tip: 'Sweet spot 1500/5000 chars. Hook SEO + 2-3 đoạn + #shorts đầu tiên.',
  },
}

function CaptionCard({
  platform,
  text,
  charCount,
  sanitizeReplacements,
}: {
  platform: Platform
  text: string
  charCount: number
  sanitizeReplacements: SanitizeReplacement[]
}) {
  const meta = PLATFORMS[platform]
  const [copied, setCopied] = useState(false)
  const overBudget = charCount > meta.charBudget
  const overTarget = charCount > meta.targetMax
  // Dedupe sanitize replacements by `from` so a caption that masks the
  // same word 3 times reports "1 word" not "3 instances" — matches what
  // users typically want to see in the badge.
  const uniqueMasked = Array.from(
    new Set(sanitizeReplacements.map((r) => r.from.toLowerCase()))
  )

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail in non-secure contexts; user can still
      // select + copy by hand from the textarea.
    }
  }

  return (
    <div className="flex h-full flex-col rounded-md border bg-secondary/20 p-3">
      {/* Header row: platform badge left, Copy button right.
          Char count moved to its own line below to avoid the three-element
          squeeze that wraps the count vertically in narrow columns. */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
            meta.color
          )}
        >
          {meta.label}
        </span>
        <Button size="sm" variant={copied ? 'default' : 'outline'} onClick={onCopy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {/* Char count + sweet-spot indicator on its own line. */}
      <div
        className={cn(
          'mt-2 flex items-center justify-between gap-2 text-[10px] tabular-nums',
          overBudget
            ? 'text-destructive'
            : overTarget
              ? 'text-amber-400'
              : 'text-muted-foreground'
        )}
        title={
          overBudget
            ? `Vượt budget ${meta.charBudget} chars — platform sẽ cắt`
            : overTarget
              ? `Vượt sweet spot ${meta.targetMax} chars — caption sẽ kém hiệu quả`
              : `Sweet spot ≤ ${meta.targetMax} chars`
        }
      >
        <span>
          {charCount} / {meta.targetMax} chars{overTarget ? ' ⚠' : ''}
        </span>
        <span className="text-muted-foreground/70">sweet spot</span>
      </div>

      <Textarea
        readOnly
        value={text}
        className="mt-2 min-h-[140px] flex-1 resize-y font-mono text-xs leading-relaxed"
        onFocus={(e) => e.currentTarget.select()}
      />
      {/* Sanitize badge — visible only when something was actually
          masked. Hover to see the exact words ("kill, dead, suicide").
          Keeps the dialog quiet for benign captions while flagging
          rewrites the user might want to know about. */}
      {uniqueMasked.length > 0 ? (
        <p
          className="mt-2 flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300"
          title={`Masked words: ${uniqueMasked.join(', ')}`}
        >
          <ShieldCheck className="size-3" />
          {uniqueMasked.length} từ nhạy cảm đã được mask để tránh bị giảm reach
        </p>
      ) : null}
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground/80">
        {meta.tip}
      </p>
    </div>
  )
}

export type SocialCaptionDialogProps = {
  projectId: string
  trigger: React.ReactNode
}

/**
 * Data shape returned from /api/projects/[id]/social-caption — adds
 * `source` + `generatedAt` on top of `SocialCaptionResult` so the
 * dialog can badge LLM-rewritten content distinctly from the
 * deterministic local template.
 */
type CaptionDataWithSource = SocialCaptionResult & {
  source: 'template' | 'llm-rewrite'
  generatedAt?: string
}

export function SocialCaptionDialog({ projectId, trigger }: SocialCaptionDialogProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CaptionDataWithSource | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Refresh / regenerate flow state. `regenerating` toggles the
  // loading overlay; `regenStep` mirrors the Claude CLI job.step so
  // the sub-text reflects what Claude is doing right now.
  const [regenerating, setRegenerating] = useState(false)
  const [regenStep, setRegenStep] = useState<string>('Claude đang viết caption và hashtag…')
  const [regenError, setRegenError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCaption = useCallback(
    async (signal?: AbortSignal): Promise<CaptionDataWithSource> => {
      const res = await fetch(`/api/projects/${projectId}/social-caption`, {
        cache: 'no-store',
        signal,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      return (await res.json()) as CaptionDataWithSource
    },
    [projectId]
  )

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchCaption(controller.signal)
      .then((body) => setData(body))
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [open, fetchCaption])

  // Clean up the polling interval if the dialog closes mid-refresh.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    if (regenerating) return
    setRegenerating(true)
    setRegenError(null)
    setRegenStep('Claude đang viết caption và hashtag…')
    try {
      const res = await fetch(
        `/api/projects/${projectId}/social-caption/regenerate`,
        { method: 'POST' }
      )
      const body = (await res.json().catch(() => ({}))) as {
        jobId?: string
        error?: string
        job?: { jobId?: string }
      }
      if (!res.ok) {
        // 409 returns the existing job — fall through to polling it.
        if (res.status === 409 && body.job?.jobId) {
          // existing job still running — attach to it
        } else {
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
      }
      const jobId = body.jobId ?? body.job?.jobId
      if (!jobId) throw new Error('Server did not return a jobId')

      // Poll every 1.5s until the job terminates.
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(
            `/api/projects/${projectId}/social-caption/regenerate?jobId=${encodeURIComponent(jobId)}`,
            { cache: 'no-store' }
          )
          if (!r.ok) throw new Error(`Poll HTTP ${r.status}`)
          const job = (await r.json()) as {
            status: 'running' | 'completed' | 'failed' | 'cancelled'
            step?: string
            error?: string
          }
          if (job.step) setRegenStep(job.step)
          if (job.status === 'running') return
          // Terminal state — stop polling and either refresh data or
          // surface the error.
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          if (job.status === 'completed') {
            const fresh = await fetchCaption()
            setData(fresh)
            setRegenerating(false)
          } else {
            setRegenError(job.error ?? 'Caption regeneration failed')
            setRegenerating(false)
          }
        } catch (err) {
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          setRegenError(err instanceof Error ? err.message : String(err))
          setRegenerating(false)
        }
      }, 1500)
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : String(err))
      setRegenerating(false)
    }
  }, [projectId, regenerating, fetchCaption])

  const copyHashtags = async () => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.hashtags.join(' '))
    } catch {
      // ignored
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5" />
            Social captions
            {data?.source === 'llm-rewrite' ? (
              <span
                className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                title={
                  data.generatedAt
                    ? `Claude rewrote these on ${new Date(data.generatedAt).toLocaleString()}`
                    : 'Rewritten by Claude'
                }
              >
                <Bot className="size-3" />
                Claude
              </span>
            ) : data?.source === 'template' ? (
              <span
                className="ml-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                title="Generated from a local keyword template. Click Refresh to have Claude rewrite them."
              >
                Template
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Four platform-tailored captions for your post. The Refresh
            button asks Claude CLI to rewrite them in-context (takes ~30-60s).
            Tier-1 sensitive words (death, violence, drugs) are
            auto-masked per platform to avoid reach reduction.
          </DialogDescription>
        </DialogHeader>

        {/* Refresh action sits at the top so it's visible regardless of
            which platform card the user is scrolled to. Disabled while a
            regeneration is in flight to prevent racing the storyboard
            write. */}
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={regenerating || loading}
            title="Ask Claude CLI to rewrite captions with full context"
          >
            <RefreshCw className={cn('size-3.5', regenerating && 'animate-spin')} />
            {regenerating ? 'Đang viết…' : 'Refresh with Claude'}
          </Button>
        </div>

        {regenError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {regenError}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Đang tạo caption…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data ? (
          <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {/* Loading overlay during Refresh. Dimmed bg keeps the
                stale data visible underneath so the user can compare
                old vs new once it lands; spinner + sub-text mirrors
                the home create-prompt loading pattern. */}
            {regenerating ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-md bg-background/80 backdrop-blur-sm">
                <Loader2 className="size-8 animate-spin text-primary" />
                <div className="space-y-1 text-center">
                  <p className="text-sm font-medium">Claude đang viết caption và hashtag…</p>
                  <p className="text-xs text-muted-foreground">{regenStep}</p>
                </div>
                <p className="max-w-xs text-center text-[10px] text-muted-foreground">
                  Quá trình này thường mất 30–60s. Đừng đóng dialog —
                  caption sẽ tự cập nhật khi Claude xong.
                </p>
              </div>
            ) : null}
            {/* Length-warning banner. Now points at the in-dialog
                Refresh button (above) instead of asking the user to
                "go back to Claude CLI". Text varies by source:
                - template: explain it's the deterministic baseline
                  and Refresh will produce a hook-driven rewrite.
                - llm-rewrite: Claude already retried under the
                  server-side max-length enforcement; the only way
                  this banner fires now is when a retry exhausted
                  the budget — Refresh again to ask Claude to try a
                  different angle. */}
            {data.captions.some((c) => {
              const m = PLATFORMS[c.platform]
              return c.charCount > m.targetMax
            }) ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                <p className="leading-relaxed">
                  {data.source === 'llm-rewrite'
                    ? 'Vài caption vẫn dài hơn sweet spot khuyến nghị. Bấm '
                    : 'Đang dùng template baseline — caption hơi dài cho từng platform. Bấm '}
                  <em className="not-italic font-medium text-amber-900 dark:text-amber-100">
                    Refresh with Claude
                  </em>{' '}
                  ở phía trên để Claude viết lại ngắn gọn hơn, đúng style từng platform.
                </p>
              </div>
            ) : null}

            {/* Topic + hashtag metadata block — stacked vertically so the
                12 chips can wrap without crushing the Copy button. */}
            <div className="space-y-2 rounded-md border bg-secondary/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Topic
                  </span>
                  <code className="rounded bg-secondary px-2 py-0.5 text-xs font-mono">
                    {data.topic}
                  </code>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyHashtags}
                  className="shrink-0"
                >
                  <Copy className="size-3.5" />
                  Copy hashtags
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {data.hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
            {/* 4 cards on desktop (1 per platform incl. YouTube), wrap
                to 2 cols at md and 1 col on mobile. */}
            <div className="grid auto-rows-fr grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
              {data.captions.map((c) => (
                <CaptionCard
                  key={c.platform}
                  platform={c.platform}
                  text={c.text}
                  charCount={c.charCount}
                  sanitizeReplacements={c.sanitizeReplacements ?? []}
                />
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
