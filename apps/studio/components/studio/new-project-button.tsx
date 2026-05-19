'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Language = 'vi' | 'en'
type Aspect = '9:16' | '16:9' | '1:1'

export function NewProjectButton({
  variant = 'default',
  size = 'sm',
  label = 'New project',
}: {
  variant?: 'default' | 'outline'
  size?: 'sm' | 'default' | 'lg'
  /** Override the button label — empty-state CTAs read better as "Tạo
   *  project đầu tiên" while the header CTA stays "New project". */
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState<Language>('vi')
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(title.trim() ? { title: title.trim() } : {}),
          language,
          aspect,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error ?? `HTTP ${res.status}`)
        return
      }
      // Hard navigation — App Router occasionally drops router.push when the
      // target page is server-rendered and pulls fresh data (the editor reads
      // storyboard.json off disk). window.location.assign forces a fresh GET.
      window.location.assign(`/projects/${body.projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Tạo project trống. Bạn sẽ tự thêm segment, gắn ảnh và giọng đọc
            trong Studio — không cần URL bài báo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="new-project-title">Title (optional)</Label>
            <Input
              id="new-project-title"
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              maxLength={120}
              disabled={submitting}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) {
                  e.preventDefault()
                  void submit()
                }
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Để trống nếu chưa nghĩ ra tên — sẽ dùng "Untitled YYYY-MM-DD".
              Có thể đổi sau từ Studio.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-project-language">Language</Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as Language)}
                disabled={submitting}
              >
                <SelectTrigger id="new-project-language" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vi">Tiếng Việt</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-project-aspect">Aspect</Label>
              <Select
                value={aspect}
                onValueChange={(v) => setAspect(v as Aspect)}
                disabled={submitting}
              >
                <SelectTrigger id="new-project-aspect" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 (TikTok / Reels)</SelectItem>
                  <SelectItem value="16:9">16:9 (YouTube)</SelectItem>
                  <SelectItem value="1:1">1:1 (Square)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus />
                Create
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
