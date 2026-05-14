'use client'

import { useCallback, useEffect, useState } from 'react'

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
export function useResizableInspector(): {
  width: number
  isResizing: boolean
  beginResize: (startEvent: React.MouseEvent) => void
} {
  const [width, setWidth] = useState<number>(DEFAULT_PX)
  const [isResizing, setIsResizing] = useState(false)
  // Block the persist effect until we've finished reading from
  // localStorage — otherwise the first mount writes DEFAULT_PX over
  // the user's saved value before the hydrate effect's setWidth() has
  // landed.
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage on mount. Done in useEffect so the
  // SSR / first-client renders agree on DEFAULT_PX.
  useEffect(() => {
    if (typeof window === 'undefined') {
      setHydrated(true)
      return
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = Number.parseInt(raw, 10)
        if (Number.isFinite(parsed)) {
          setWidth(clamp(parsed))
        }
      }
    } catch {
      // localStorage disabled (private browsing, quotas, etc.) — fall
      // through to default; nothing to surface to the user.
    } finally {
      setHydrated(true)
    }
  }, [])

  // Persist whenever the user finishes a drag. Gated on `hydrated` so
  // the initial render doesn't clobber the saved value.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydrated) return
    if (isResizing) return // skip mid-drag writes so we don't thrash
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width))
    } catch {
      // ignore
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
