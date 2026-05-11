'use client'

import { useRef, useState } from 'react'
import { Loader2, Music, Pause, Play, Search } from 'lucide-react'
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

const MOODS = ['calm', 'news', 'dramatic', 'energetic', 'cinematic', 'chill'] as const

export function MusicPicker({
  defaultMood,
  defaultDurationSec,
  onSelect,
  trigger,
}: {
  defaultMood?: string
  defaultDurationSec: number
  onSelect: (asset: AssetRef) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [mood, setMood] = useState(defaultMood ?? 'calm')
  const [duration, setDuration] = useState(defaultDurationSec)
  const [provider, setProvider] = useState<'archive' | 'pixabay'>('archive')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<AssetRef | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const runSearch = async () => {
    if (!mood.trim()) return
    setLoading(true)
    setError(null)
    setPreview(null)
    audioRef.current?.pause()
    audioRef.current = null
    setPlaying(false)
    try {
      const params = new URLSearchParams({
        mood,
        duration: String(duration),
        provider,
      })
      const res = await fetch(`/api/search/music?${params}`)
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

  const togglePlay = () => {
    if (!preview) return
    const url = assetUrl(preview.path)
    if (!url) return
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    if (!audioRef.current) {
      const audio = new Audio(url)
      audio.addEventListener('ended', () => setPlaying(false))
      audioRef.current = audio
    }
    audioRef.current.play().then(() => setPlaying(true)).catch((err) => setError(String(err)))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          audioRef.current?.pause()
          audioRef.current = null
          setPlaying(false)
          setPreview(null)
          setError(null)
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="size-5" />
            Pick background music
          </DialogTitle>
          <DialogDescription>
            Pixabay Music — picks the track closest to the target duration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_140px_auto] gap-2">
            <div>
              <Label htmlFor="music-mood">Mood</Label>
              <Input
                id="music-mood"
                className="mt-1"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch()
                }}
              />
            </div>
            <div>
              <Label htmlFor="music-duration">Target (s)</Label>
              <Input
                id="music-duration"
                className="mt-1"
                type="number"
                min={5}
                max={300}
                value={duration}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value)
                  if (Number.isFinite(v) && v > 0) setDuration(v)
                }}
              />
            </div>
            <Button onClick={runSearch} disabled={loading || !mood.trim()} className="self-end">
              {loading ? <Loader2 className="animate-spin" /> : <Search />}
              Find
            </Button>
          </div>

          <div className="flex gap-2 text-sm">
            <Label className="self-center">Source</Label>
            {(['archive', 'pixabay'] as const).map((p) => (
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
                {p === 'archive' ? 'archive.org' : p}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setMood(m)}
                className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-secondary"
              >
                {m}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {preview ? (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Button variant="outline" size="icon" onClick={togglePlay}>
                {playing ? <Pause /> : <Play />}
              </Button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {preview.source.attribution ?? preview.source.id ?? 'Track'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {preview.durationSec ? `${preview.durationSec.toFixed(0)}s` : 'unknown duration'} · pixabay
                </div>
              </div>
            </div>
          ) : null}
        </div>

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
            Use this track
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
