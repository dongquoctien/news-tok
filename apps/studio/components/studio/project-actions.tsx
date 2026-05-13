'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function ProjectActions({ projectId, title }: { projectId: string; title: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'duplicate' | 'delete' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const duplicate = async () => {
    setBusy('duplicate')
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      startTransition(() => router.refresh())
    } catch (err) {
      setError(`Duplicate failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    setError(null)
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setBusy(null)
      // Throw so ConfirmDialog keeps itself open and the caller's catch
      // surfaces the error below.
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    setBusy(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          duplicate()
        }}
        disabled={pending || busy !== null}
        aria-label="Duplicate project"
      >
        {busy === 'duplicate' ? <Loader2 className="animate-spin" /> : <Copy />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setConfirmOpen(true)
        }}
        disabled={pending || busy !== null}
        aria-label="Delete project"
        className="text-muted-foreground hover:text-destructive"
      >
        {busy === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${title}"?`}
        description="This removes the storyboard, scenes, segment renders, and the final mp4 from disk. The action can't be undone."
        confirmLabel="Delete project"
        destructive
        onConfirm={remove}
      />
      {error ? (
        <span className="ml-1 text-xs text-destructive" title={error}>
          !
        </span>
      ) : null}
    </div>
  )
}
