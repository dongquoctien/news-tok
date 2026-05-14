'use client'

import { useRef, useState } from 'react'
import { Check, Clock, Loader2, Music, Pause, Play, Search } from 'lucide-react'
import type { AssetRef } from '@news-tok/shared/schema'
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

const MOODS = ['calm', 'news', 'dramatic', 'energetic', 'cinematic', 'chill'] as const
const LIST_SIZE = 8

type Mode = 'search' | 'upload'

/** One row in the archive.org candidate list. Streams directly from
 *  archive.org's CDN during audition — only the user-selected track is
 *  downloaded to cache (via POST /api/search/music/fetch). */
type TrackCandidate = {
  identifier: string
  fileName: string
  streamUrl: string
  pageUrl: string
  title?: string
  creator?: string
  durationSec?: number
  licenseurl?: string
}

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
  const [mode, setMode] = useState<Mode>('search')
  const [mood, setMood] = useState(defaultMood ?? 'calm')
  const [duration, setDuration] = useState(defaultDurationSec)
  const [provider, setProvider] = useState<'archive' | 'pixabay'>('archive')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Archive list flow: tracks visible in the grid, plus the candidate
  // the user is auditioning / has selected.
  const [tracks, setTracks] = useState<TrackCandidate[]>([])
  const [selectedTrack, setSelectedTrack] = useState<TrackCandidate | null>(null)
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Pixabay + upload flows still surface a single preview AssetRef
  // because both produce a cached AssetRef immediately (no list).
  const [singlePreview, setSinglePreview] = useState<AssetRef | null>(null)
  const [playingSingle, setPlayingSingle] = useState(false)

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    audioRef.current = null
    setPlayingTrackId(null)
    setPlayingSingle(false)
  }

  const runSearch = async () => {
    if (!mood.trim()) return
    setLoading(true)
    setError(null)
    setTracks([])
    setSelectedTrack(null)
    setSinglePreview(null)
    stopAudio()
    try {
      if (provider === 'archive') {
        // archive.org → list of candidates. User picks then we fetch.
        const params = new URLSearchParams({
          mood,
          duration: String(duration),
          limit: String(LIST_SIZE),
        })
        const res = await fetch(`/api/search/music/list?${params}`)
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        const body = (await res.json()) as { tracks: TrackCandidate[] }
        if (body.tracks.length === 0) {
          throw new Error(`No archive.org tracks for mood "${mood}"`)
        }
        setTracks(body.tracks)
        setSelectedTrack(body.tracks[0] ?? null)
      } else {
        // pixabay → single-track legacy flow (already cached server-side).
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
        setSinglePreview(body.asset)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const togglePlayTrack = (track: TrackCandidate) => {
    const isSame = playingTrackId === track.identifier
    if (isSame) {
      audioRef.current?.pause()
      setPlayingTrackId(null)
      return
    }
    // Stop any previous audio, then start the new track. We stream from
    // archive.org's CDN directly; the file isn't cached locally until
    // the user clicks Apply.
    stopAudio()
    const audio = new Audio(track.streamUrl)
    audio.addEventListener('ended', () => setPlayingTrackId(null))
    audio.addEventListener('error', () => {
      setError(`Failed to stream "${track.title ?? track.identifier}"`)
      setPlayingTrackId(null)
    })
    audioRef.current = audio
    audio.play().then(() => setPlayingTrackId(track.identifier)).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    )
  }

  const togglePlaySingle = () => {
    if (!singlePreview) return
    if (playingSingle) {
      audioRef.current?.pause()
      setPlayingSingle(false)
      return
    }
    stopAudio()
    // Local cache file — Studio exposes it via /api/asset.
    const url = `/api/asset?path=${encodeURIComponent(singlePreview.path)}`
    const audio = new Audio(url)
    audio.addEventListener('ended', () => setPlayingSingle(false))
    audioRef.current = audio
    audio.play().then(() => setPlayingSingle(true)).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    )
  }

  const applyArchiveTrack = async () => {
    if (!selectedTrack) return
    setApplying(true)
    setError(null)
    try {
      const res = await fetch('/api/search/music/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: selectedTrack.identifier,
          fileName: selectedTrack.fileName,
          title: selectedTrack.title,
          creator: selectedTrack.creator,
          durationSec: selectedTrack.durationSec,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const body = (await res.json()) as { asset: AssetRef }
      stopAudio()
      onSelect(body.asset)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          stopAudio()
          setTracks([])
          setSelectedTrack(null)
          setSinglePreview(null)
          setError(null)
          setMode('search')
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="size-5" />
            {mode === 'search' ? 'Pick background music' : 'Upload your own track'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'search'
              ? `Internet Archive / Pixabay — prefers tracks ≥ ${duration | 0}s so the loop seam stays inaudible.`
              : 'Drop an MP3, WAV, OGG, AAC, or M4A. Stored under data/cache/uploads/.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-md border p-1 text-xs">
          {(['search', 'upload'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError(null)
                stopAudio()
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

        {mode === 'upload' ? (
          <div className="space-y-3">
            <UploadDropzone
              accept="audio/*"
              hint="MP3 / WAV / OGG / AAC / M4A · up to 50 MB"
              onUploaded={(asset) => {
                stopAudio()
                setSinglePreview(asset)
                setError(null)
              }}
            />
            {singlePreview ? (
              <SingleTrackCard
                asset={singlePreview}
                playing={playingSingle}
                onToggle={togglePlaySingle}
                provider="local"
              />
            ) : null}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
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

            {/* Archive list view */}
            {provider === 'archive' && tracks.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {tracks.length} candidates — click ▶ to audition, then highlight one and Apply.
                  Green check = covers the target duration; no loop seam needed.
                </p>
                <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
                  {tracks.map((track) => (
                    <TrackRow
                      key={track.identifier}
                      track={track}
                      selected={selectedTrack?.identifier === track.identifier}
                      playing={playingTrackId === track.identifier}
                      target={duration}
                      onSelect={() => setSelectedTrack(track)}
                      onToggle={() => togglePlayTrack(track)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Pixabay single-preview view */}
            {provider === 'pixabay' && singlePreview ? (
              <SingleTrackCard
                asset={singlePreview}
                playing={playingSingle}
                onToggle={togglePlaySingle}
                provider="pixabay"
              />
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              stopAudio()
              setOpen(false)
            }}
          >
            Cancel
          </Button>
          {/* Archive flow → fetch the selected track to cache before
              calling onSelect. Pixabay / Upload already produced an
              AssetRef, so commit it directly. */}
          {mode === 'search' && provider === 'archive' ? (
            <Button disabled={!selectedTrack || applying} onClick={applyArchiveTrack}>
              {applying ? <Loader2 className="animate-spin" /> : null}
              Use this track
            </Button>
          ) : (
            <Button
              disabled={!singlePreview}
              onClick={() => {
                if (singlePreview) {
                  stopAudio()
                  onSelect(singlePreview)
                  setOpen(false)
                }
              }}
            >
              Use this track
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TrackRow({
  track,
  selected,
  playing,
  target,
  onSelect,
  onToggle,
}: {
  track: TrackCandidate
  selected: boolean
  playing: boolean
  target: number
  onSelect: () => void
  onToggle: () => void
}) {
  const dur = track.durationSec ?? 0
  const longEnough = dur >= target
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:bg-secondary/40'
      )}
    >
      <Button
        variant="outline"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        title={playing ? 'Pause audition' : 'Audition this track'}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {track.title ?? track.identifier}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {track.creator ?? 'Unknown artist'}
        </div>
      </div>
      <div
        className={cn(
          'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide',
          longEnough
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-border text-muted-foreground'
        )}
        title={
          longEnough
            ? `Covers the full ${target | 0}s — no loop seam`
            : `Only ${dur | 0}s — will loop to fill ${target | 0}s`
        }
      >
        {longEnough ? <Check className="size-3" /> : <Clock className="size-3" />}
        {dur ? `${dur.toFixed(0)}s` : '?'}
      </div>
    </button>
  )
}

function SingleTrackCard({
  asset,
  playing,
  onToggle,
  provider,
}: {
  asset: AssetRef
  playing: boolean
  onToggle: () => void
  provider: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <Button variant="outline" size="icon" onClick={onToggle}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {asset.source.attribution ?? asset.source.id ?? 'Track'}
        </div>
        <div className="text-xs text-muted-foreground">
          {asset.durationSec ? `${asset.durationSec.toFixed(0)}s` : 'unknown duration'} ·{' '}
          {provider}
        </div>
      </div>
    </div>
  )
}
