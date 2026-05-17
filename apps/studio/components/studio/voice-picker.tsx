'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Mic, Pause, Play } from 'lucide-react'
import type { Language } from '@news-tok/shared/schema'
import { assetUrl } from '@/lib/asset-url'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Voice = {
  Name: string
  ShortName: string
  Gender: 'Male' | 'Female' | string
  Locale: string
  FriendlyName: string
}

type PreviewState = { voiceId: string; status: 'loading' | 'playing' | 'idle' }

export function VoicePicker({
  language,
  currentVoiceId,
  onSelect,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  language: Language
  currentVoiceId: string
  onSelect: (voiceId: string) => void
  /** Optional when the dialog is controlled — pass `open` + `onOpenChange`
   *  to drive it from outside (e.g. opening from a dropdown menu item). */
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const [voices, setVoices] = useState<Voice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState>({ voiceId: '', status: 'idle' })
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!open || voices) return
    let cancelled = false
    fetch(`/api/voices?lang=${language}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((body) => {
        if (!cancelled) setVoices(body.voices as Voice[])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [open, language, voices])

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      // Force-release the underlying media handle. Otherwise Chrome
      // keeps the HTMLAudioElement attached to its WASAPI session
      // after pause(), which on Windows 11 build 26200 can pile up
      // stale audio sessions and contribute to the audiosrv freeze
      // that makes the whole laptop go silent.
      try {
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      } catch {
        // best-effort
      }
    }
    audioRef.current = null
    setPreview({ voiceId: '', status: 'idle' })
  }

  useEffect(() => {
    if (!open) stopAudio()
  }, [open])

  // Belt-and-braces unmount cleanup — `open` flipping false is the
  // common path, but if the parent unmounts the picker entirely (e.g.
  // user navigates away) the `open` effect never fires. This catches
  // that case so a preview audio handle can't outlive the component.
  useEffect(() => {
    return () => {
      stopAudio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = useMemo(() => {
    const g: Record<string, Voice[]> = {}
    for (const v of voices ?? []) {
      const key = v.Gender || 'Other'
      ;(g[key] ??= []).push(v)
    }
    return g
  }, [voices])

  const playPreview = async (voiceId: string) => {
    if (preview.status === 'playing' && preview.voiceId === voiceId) {
      audioRef.current?.pause()
      setPreview({ voiceId, status: 'idle' })
      return
    }
    audioRef.current?.pause()
    setPreview({ voiceId, status: 'loading' })
    try {
      const res = await fetch('/api/voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const { path } = (await res.json()) as { path: string }
      const url = assetUrl(path)
      if (!url) throw new Error('no preview URL')
      const audio = new Audio(url)
      audioRef.current = audio
      audio.addEventListener('ended', () => setPreview({ voiceId, status: 'idle' }))
      await audio.play()
      setPreview({ voiceId, status: 'playing' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPreview({ voiceId, status: 'idle' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="size-5" />
            Pick a voice
          </DialogTitle>
          <DialogDescription>
            Microsoft Edge neural voices for {language === 'vi' ? 'Vietnamese' : 'English'}. Click
            play to hear a short sample.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !voices ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading voices…
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {Object.entries(grouped).map(([gender, list]) => (
              <div key={gender}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {gender}
                </h4>
                <ul className="space-y-1">
                  {list.map((v) => {
                    const selected = v.ShortName === currentVoiceId
                    const isPlaying =
                      preview.voiceId === v.ShortName && preview.status === 'playing'
                    const isLoading =
                      preview.voiceId === v.ShortName && preview.status === 'loading'
                    return (
                      <li
                        key={v.ShortName}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-3 py-2 transition-colors',
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-transparent hover:bg-secondary'
                        )}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => playPreview(v.ShortName)}
                          disabled={isLoading}
                          aria-label={`Preview ${v.ShortName}`}
                        >
                          {isLoading ? (
                            <Loader2 className="animate-spin" />
                          ) : isPlaying ? (
                            <Pause />
                          ) : (
                            <Play />
                          )}
                        </Button>
                        <button
                          onClick={() => {
                            stopAudio()
                            onSelect(v.ShortName)
                            setOpen(false)
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="font-mono text-sm">{v.ShortName}</div>
                          <div className="text-xs text-muted-foreground">{v.FriendlyName}</div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
