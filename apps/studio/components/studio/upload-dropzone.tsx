'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import type { AssetRef } from '@news-tok/shared/schema'
import { cn } from '@/lib/utils'

export type UploadDropzoneProps = {
  /** MIME prefix accepted by the file input ("image/*" or "audio/*"). */
  accept: 'image/*' | 'audio/*'
  /** Human label rendered in the dropzone body. */
  hint: string
  /** Called once the upload succeeds with the returned AssetRef. */
  onUploaded: (asset: AssetRef) => void
}

export function UploadDropzone({ accept, hint, onUploaded }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastName, setLastName] = useState<string | null>(null)

  const upload = async (file: File) => {
    setError(null)
    setUploading(true)
    setLastName(file.name)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const body = (await res.json()) as { asset: AssetRef }
      onUploaded(body.asset)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void upload(file)
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragging) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-8 text-center transition-colors',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary hover:bg-secondary/50'
        )}
      >
        {uploading ? (
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="size-8 text-muted-foreground" />
        )}
        <p className="mt-3 text-sm font-medium">
          {uploading ? 'Uploading…' : 'Drop a file here or click to choose'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        {lastName && !uploading ? (
          <p className="mt-2 text-xs text-muted-foreground">Last: {lastName}</p>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          // Reset so the same file can be re-uploaded if desired.
          e.target.value = ''
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
