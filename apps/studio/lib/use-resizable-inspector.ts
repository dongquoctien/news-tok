'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'news-tok.inspector-width'
const DEFAULT_PX = 320
const MIN_PX = 280
const MAX_PX = 640

/**
 * Width state for the segment-editor right inspector. Persisted to
 * localStorage so the user's chosen panel size survives page reloads.
 *
 * Reasoning for the bounds:
 *   - 280px is the smallest width at which the layout / text-style
 *     code chips don't collide with their "Change" buttons.
 *   - 640px keeps the centre player a sensible size on a 1440px
 *     screen (player = ~540px after both asides) — wider than that
 *     and the player gets uncomfortably narrow.
 *
 * SSR-safe: the initial render uses DEFAULT_PX, then useEffect hydrates
 * from localStorage on mount so the server-rendered markup matches
 * the first client render.
 */
/**
 * Read the persisted width synchronously. Returns DEFAULT_PX on the
 * server (no `window`) and on cold clients with nothing in storage.
 */
function readStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_PX
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PX
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_PX
  } catch {
    return DEFAULT_PX
  }
}

export function useResizableInspector(): {
  width: number
  isResizing: boolean
  beginResize: (startEvent: React.MouseEvent) => void
} {
  // SSR + first client hydrate both run with DEFAULT_PX so the
  // server-rendered HTML and the initial client tree match (no
  // hydration warning). Lazy useState initializer is NOT enough
  // here — Next.js reuses the SSR-pinned initial state when
  // hydrating the client tree.
  const [width, setWidth] = useState<number>(DEFAULT_PX)
  const [isResizing, setIsResizing] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // useLayoutEffect commits the saved width BEFORE the browser
  // paints the hydrated tree — so the user never sees the 320px
  // flash that an ordinary useEffect would let through. Falls back
  // to plain useEffect on the server where useLayoutEffect logs a
  // warning (this hook is client-only, but Next.js may still
  // invoke it during preview SSR).
  const useIsoEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
  useIsoEffect(() => {
    const stored = readStoredWidth()
    if (stored !== DEFAULT_PX) setWidth(stored)
    setHydrated(true)
  }, [])

  // Persist whenever the user finishes a drag. Gated on `hydrated`
  // so the first commit doesn't write DEFAULT_PX over the saved
  // value before useLayoutEffect's setWidth lands.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydrated) return
    if (isResizing) return // skip mid-drag writes so we don't thrash
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width))
    } catch {
      // localStorage disabled (private browsing, quota, etc.) — the
      // session-local state still works; we just won't survive reload.
    }
  }, [width, isResizing, hydrated])

  /**
   * Wire up the drag from a mousedown on the splitter handle. Attaches
   * mousemove / mouseup to window for the duration so the drag survives
   * the cursor leaving the handle element.
   */
  const beginResize = useCallback((startEvent: React.MouseEvent) => {
    startEvent.preventDefault()
    setIsResizing(true)
    const startX = startEvent.clientX
    const startWidth = width
    const onMove = (e: MouseEvent) => {
      // Splitter sits to the right of centre and on the left of the
      // inspector. Drag left → expand inspector; drag right → shrink.
      const delta = startX - e.clientX
      setWidth(clamp(startWidth + delta))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Reset cursor + selection blockers we set below.
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setIsResizing(false)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  return { width, isResizing, beginResize }
}

function clamp(value: number): number {
  if (value < MIN_PX) return MIN_PX
  if (value > MAX_PX) return MAX_PX
  return value
}
