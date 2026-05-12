'use client'

import { useState } from 'react'
import { Image as ImageIcon, Loader2, Search } from 'lucide-react'
import type { AssetRef } from '@news-tok/shared/schema'
import { assetUrl } from '@/lib/asset-url'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { UploadDropzone } from '@/components/studio/upload-dropzone'

type Mode = 'search' | 'upload'

export function ImagePicker({
  defaultQuery,
  orientation,
  onSelect,
  trigger,
}: {
  defaultQuery?: string
  orientation?: 'landscape' | 'portrait' | 'square'
  onSelect: (asset: AssetRef) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState(defaultQuery ?? '')
  const [provider, setProvider] = useState<'pexels' | 'pixabay' | 'unsplash'>('pexels')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<AssetRef | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const params = new URLSearchParams({ q: query, provider })
      if (orientation) params.set('orientation', orientation)
      const res = await fetch(`/api/search/image?${params}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const body = (await res.json()) as { asset: AssetRef }
      setPreview(body.asset)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const previewUrl = assetUrl(preview?.path)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setPreview(null)
          setError(null)
          setMode('search')
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="size-5" />
            {mode === 'search' ? 'Find an image' : 'Upload an image'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'search'
              ? 'Search Pexels / Unsplash / Pixabay — top result is cached locally.'
              : 'Drop a JPG, PNG, WebP, or GIF from your machine. Stored under data/cache/uploads/.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-md border p-1 text-xs">
          {(['search', 'upload'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              className={cn(
                'flex-1 rounded-sm px-3 py-1.5 uppercase tracking-wide transition-colors',
                m === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary'
              )}
            >
              {m === 'search' ? 'Search online' : 'Upload from computer'}
            </button>
          ))}
        </div>

        {mode === 'search' ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch()
                }}
                placeholder="e.g. server room, james webb telescope"
                autoFocus
              />
              <Button onClick={runSearch} disabled={loading || !query.trim()}>
                {loading ? <Loader2 className="animate-spin" /> : <Search />}
                Search
              </Button>
            </div>
            <div className="flex gap-2 text-sm">
              <Label className="self-center">Provider</Label>
              {(['pexels', 'unsplash', 'pixabay'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={cn(
                    'rounded-md border px-3 py-1 text-xs uppercase tracking-wide',
                    p === provider
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-secondary'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {previewUrl && preview ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt={query} className="block max-h-[50vh] w-full object-contain" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {preview.width}×{preview.height} · {preview.source.provider}
                  {preview.source.attribution ? ` · ${preview.source.attribution}` : null}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <UploadDropzone
              accept="image/*"
              hint="JPG / PNG / WebP / GIF · up to 50 MB"
              onUploaded={(asset) => {
                setPreview(asset)
                setError(null)
              }}
            />
            {previewUrl && preview ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="uploaded" className="block max-h-[40vh] w-full object-contain" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Local upload · {preview.source.attribution ?? preview.source.id}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!preview}
            onClick={() => {
              if (preview) {
                onSelect(preview)
                setOpen(false)
              }
            }}
          >
            Use this image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
