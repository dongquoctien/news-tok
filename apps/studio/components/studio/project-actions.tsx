'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ProjectActions({ projectId, title }: { projectId: string; title: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'duplicate' | 'delete' | null>(null)

  const duplicate = async () => {
    setBusy('duplicate')
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      startTransition(() => router.refresh())
    } catch (err) {
      alert(`Duplicate failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete project "${title}"? This removes all assets and renders.`)) return
    setBusy('delete')
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      startTransition(() => router.refresh())
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setBusy(null)
    }
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
          remove()
        }}
        disabled={pending || busy !== null}
        aria-label="Delete project"
        className="text-muted-foreground hover:text-destructive"
      >
        {busy === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </div>
  )
}
