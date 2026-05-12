'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Loader2, Share2, Sparkles } from 'lucide-react'
import type { SocialCaptionResult } from '@news-tok/shared/social'
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
  'tiktok' | 'facebook' | 'instagram',
  PlatformMeta & { targetMax: number }
> = {
  tiktok: {
    label: 'TikTok',
    color: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    charBudget: 2200,
    targetMax: 250,
    tip: 'Sweet spot 120–250 chars. Hook ngắn + 1 câu drama + ≤6 hashtag.',
  },
  facebook: {
    label: 'Facebook',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
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
}

function CaptionCard({
  platform,
  text,
  charCount,
}: {
  platform: 'tiktok' | 'facebook' | 'instagram'
  text: string
  charCount: number
}) {
  const meta = PLATFORMS[platform]
  const [copied, setCopied] = useState(false)
  const overBudget = charCount > meta.charBudget
  const overTarget = charCount > meta.targetMax

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
    <div className="rounded-md border bg-secondary/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
            meta.color
          )}
        >
          {meta.label}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-[10px] tabular-nums',
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
            {charCount} / {meta.targetMax}
            {overTarget ? ' ⚠' : ''}
          </span>
          <Button size="sm" variant={copied ? 'default' : 'outline'} onClick={onCopy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <Textarea
        readOnly
        value={text}
        className="mt-2 min-h-[180px] resize-y font-mono text-xs leading-relaxed"
        onFocus={(e) => e.currentTarget.select()}
      />
      <p className="mt-1 text-[10px] text-muted-foreground">{meta.tip}</p>
    </div>
  )
}

export type SocialCaptionDialogProps = {
  projectId: string
  trigger: React.ReactNode
}

export function SocialCaptionDialog({ projectId, trigger }: SocialCaptionDialogProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<SocialCaptionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/projects/${projectId}/social-caption`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((b: { error?: string }) => {
            throw new Error(b.error ?? `HTTP ${res.status}`)
          })
        }
        return res.json() as Promise<SocialCaptionResult>
      })
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5" />
            Social captions
          </DialogTitle>
          <DialogDescription>
            Three platform-tailored captions generated from the storyboard.
            Click Copy to grab one, then paste into your TikTok / Facebook /
            Instagram post.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Đang tạo caption…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data ? (
          <>
            {/* AI rewrite hint — surface when any baseline caption exceeds
                the platform sweet spot. The orchestrator (Claude in CLI)
                can compress the verbose template output into hook-driven
                copy; the dialog itself only shows the template baseline. */}
            {data.captions.some((c) => {
              const m = PLATFORMS[c.platform]
              return c.charCount > m.targetMax
            }) ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <Sparkles className="mt-0.5 size-4 shrink-0" />
                <div>
                  <strong>Baseline đang hơi dài.</strong> Caption template
                  liệt kê thẳng từ storyboard — có thể vượt sweet spot mỗi
                  platform.{' '}
                  <span className="text-amber-300/80">
                    Quay lại Claude CLI và yêu cầu "cải thiện caption ngắn
                    gọn hơn" — orchestrator sẽ rewrite theo style từng
                    platform (xem CLAUDE.md §"prep video for social
                    upload").
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-secondary/20 p-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Topic
              </span>
              <code className="rounded bg-secondary px-2 py-0.5 text-xs font-mono">
                {data.topic}
              </code>
              <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                Hashtags
              </span>
              <div className="flex flex-1 flex-wrap items-center gap-1">
                {data.hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                  >
                    {h}
                  </span>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={copyHashtags}>
                <Copy className="size-3.5" />
                Copy hashtags
              </Button>
            </div>
            <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-3">
              {data.captions.map((c) => (
                <CaptionCard
                  key={c.platform}
                  platform={c.platform}
                  text={c.text}
                  charCount={c.charCount}
                />
              ))}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
