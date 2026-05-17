'use client'

/**
 * Filmstrip-style trim slider for a background video clip. Renders a
 * row of evenly-spaced poster frames (sourced from /api/video-filmstrip)
 * with two amber drag handles for start/end selection. The pattern
 * mirrors CapCut / Premiere — the timeline is the filmstrip itself, so
 * users can see *what* they're cutting, not just where.
 *
 * The component is controlled: the parent owns the trim window and
 * receives `onChange` after each handle drag. A short tooltip on each
 * handle shows the current timestamp so users can land on an exact
 * second without scrubbing through a separate preview.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FilmstripTrim = { startSec: number; endSec?: number }

type FilmstripFrame = { atSec: number; url: string }

type FilmstripResponse = {
  durationSec: number
  frames: FilmstripFrame[]
}

type FilmstripTrimmerProps = {
  /** Asset path (data/-relative) to pass through to /api/video-filmstrip. */
  assetPath: string
  /** Total source clip duration. Used as fallback when fetch is in flight. */
  durationSec: number
  /** Current trim window. `endSec` undefined means "end of clip". */
  trim: FilmstripTrim
  onChange: (next: FilmstripTrim) => void
  /** Optional disabled state (e.g. while another network op runs). */
  disabled?: boolean
  /** Optional preview <video> ref — when set, the start handle seeks it. */
  previewRef?: React.RefObject<HTMLVideoElement | null>
}

/** Format seconds as `mm:ss.s` for the handle tooltips. */
function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00.0'
  const s = Math.max(0, sec)
  const mm = Math.floor(s / 60)
  const ss = s - mm * 60
  return `${mm}:${ss.toFixed(1).padStart(4, '0')}`
}

export function FilmstripTrimmer({
  assetPath,
  durationSec,
  trim,
  onChange,
  disabled,
  previewRef,
}: FilmstripTrimmerProps) {
  const [data, setData] = useState<FilmstripResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  // Track which handle is being dragged so pointermove on the window
  // can update the right edge.
  const dragRef = useRef<null | 'start' | 'end'>(null)

  // Fetch filmstrip frames once per asset. The endpoint already
  // content-hash-caches inside /api/video-poster, so this round-trip is
  // a sub-100ms metadata call after the first warm-up.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    fetch(
      `/api/video-filmstrip?path=${encodeURIComponent(assetPath)}&count=8&width=160`
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<FilmstripResponse>
      })
      .then((body) => {
        if (cancelled) return
        setData(body)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [assetPath])

  const totalSec = data?.durationSec ?? durationSec
  const endSec = trim.endSec ?? totalSec
  const clampedStart = Math.max(0, Math.min(trim.startSec, totalSec))
  const clampedEnd = Math.max(clampedStart + 0.1, Math.min(endSec, totalSec))

  const startPct = (clampedStart / totalSec) * 100
  const endPct = (clampedEnd / totalSec) * 100

  // Translate a clientX pixel position to a time-within-clip (in seconds).
  const pxToSec = useCallback(
    (clientX: number): number => {
      const strip = stripRef.current
      if (!strip) return 0
      const rect = strip.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return pct * totalSec
    },
    [totalSec]
  )

  const onHandleDown = (handle: 'start' | 'end') => (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    dragRef.current = handle
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onHandleMove = (e: React.PointerEvent) => {
    const handle = dragRef.current
    if (!handle) return
    const sec = pxToSec(e.clientX)
    if (handle === 'start') {
      // Don't let start cross end (keep at least 0.1s window).
      const next = Math.max(0, Math.min(sec, clampedEnd - 0.1))
      onChange({ startSec: next, endSec: trim.endSec })
      if (previewRef?.current) {
        try {
          previewRef.current.currentTime = next
        } catch {
          // older clips may throw if not yet seekable — silent
        }
      }
    } else {
      const next = Math.max(clampedStart + 0.1, Math.min(sec, totalSec))
      // Collapse to undefined when end is the full clip, so a user
      // who only trims the start doesn't bloat storyboard.json with
      // an `endSec` that's already implicit.
      const collapse = Math.abs(next - totalSec) < 0.05
      onChange({
        startSec: trim.startSec,
        endSec: collapse ? undefined : next,
      })
    }
  }

  const onHandleUp = (e: React.PointerEvent) => {
    dragRef.current = null
    try {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
    } catch {
      // capture may already be released — ignore
    }
  }

  const frames = useMemo(() => data?.frames ?? [], [data])

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{fmt(clampedStart)}</span>
        <span>
          {fmt(clampedEnd - clampedStart)} selected · {fmt(totalSec)} total
        </span>
        <span>{fmt(clampedEnd)}</span>
      </div>

      <div
        ref={stripRef}
        className={cn(
          'relative h-14 select-none overflow-hidden rounded border bg-muted',
          disabled && 'pointer-events-none opacity-60'
        )}
      >
        {/* Filmstrip backdrop — 8 thumbnails laid out evenly. We render
            even when loading=false so the strip never collapses
            mid-interaction; the loader sits as an overlay. */}
        {frames.length > 0 ? (
          <div className="absolute inset-0 flex">
            {frames.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f.atSec}
                src={f.url}
                alt=""
                loading="lazy"
                className="block h-full flex-1 object-cover"
                draggable={false}
              />
            ))}
          </div>
        ) : null}

        {/* Dim the regions OUTSIDE the trim window so the selected
            window pops. Two absolute strips on either side of the
            handles. */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-black/60"
          style={{ width: `${startPct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-black/60"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* Loader overlay for the first paint. */}
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {/* Selected-window border. */}
        <div
          className="pointer-events-none absolute inset-y-0 border-y-2 border-amber-400"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />

        {/* Start handle. */}
        <div
          role="slider"
          aria-label="Trim start"
          aria-valuenow={Math.round(clampedStart * 10) / 10}
          aria-valuemin={0}
          aria-valuemax={totalSec}
          onPointerDown={onHandleDown('start')}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="absolute top-0 z-10 h-full w-2.5 -translate-x-1/2 cursor-ew-resize bg-amber-400 ring-1 ring-amber-600 transition-colors hover:bg-amber-300"
          style={{ left: `${startPct}%` }}
          title={`Start at ${fmt(clampedStart)}`}
        />

        {/* End handle. */}
        <div
          role="slider"
          aria-label="Trim end"
          aria-valuenow={Math.round(clampedEnd * 10) / 10}
          aria-valuemin={0}
          aria-valuemax={totalSec}
          onPointerDown={onHandleDown('end')}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="absolute top-0 z-10 h-full w-2.5 -translate-x-1/2 cursor-ew-resize bg-amber-400 ring-1 ring-amber-600 transition-colors hover:bg-amber-300"
          style={{ left: `${endPct}%` }}
          title={`End at ${fmt(clampedEnd)}`}
        />
      </div>

      {error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
