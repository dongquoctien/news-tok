'use client'

import { useEffect, useState } from 'react'
import type { ColorOverride } from '@news-tok/shared/schema'

/**
 * Snapshot of the "style cluster" copied from one segment so it can
 * be pasted onto one or more other segments. Lives in memory only —
 * survives across pickers and segment switches within a Studio
 * session, gets cleared on page reload.
 *
 * Why in-memory, not localStorage / per-user file:
 *   - User asked for the simplest UX; clipboard is a within-session
 *     ergonomics tool, not a long-lived setting.
 *   - Avoids the "paste from another project" footgun where the
 *     clipboard's textStyleId / layoutId references something that
 *     doesn't exist in the open project.
 *
 * sourceSegmentId + sourceSegmentLabel are kept so the Paste button
 * can show "Copied from segment 2 (Bão số 5…)" — gives the user a
 * sanity check before they overwrite work.
 *
 * sourceVariantId records which variant the user copied from. The
 * editor uses it to decide whether variant-scoped overrides
 * (textStyleBySegmentId etc) should be replayed onto the variant
 * the user is now previewing.
 */
export type StyleSnapshot = {
  // Layout-related
  layoutId: string | undefined
  eyebrow: string | undefined
  chips: string[] | undefined
  fileId: string | undefined
  // Text style + overrides
  textStyleId: string | undefined
  fontOverride: string | undefined
  colorOverride: ColorOverride | undefined
  // Provenance for the hint chip
  sourceSegmentId: string
  sourceSegmentLabel: string
  sourceVariantId: string | null
  copiedAt: number
}

// Module-level singleton store + tiny pub/sub so every hook instance
// re-renders together when copy fires. Mirrors the pattern used by
// useFavorites — keeps the contract identical so future devs reading
// one file already understand the other.
let cache: StyleSnapshot | null = null
const subscribers = new Set<() => void>()
function notify(): void {
  for (const fn of subscribers) fn()
}

export function useStyleClipboard(): {
  snapshot: StyleSnapshot | null
  /** Replace the clipboard with a new snapshot. Passing null clears it. */
  setSnapshot: (next: StyleSnapshot | null) => void
} {
  const [, force] = useState(0)
  useEffect(() => {
    const cb = () => force((n) => n + 1)
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])

  return {
    snapshot: cache,
    setSnapshot: (next) => {
      cache = next
      notify()
    },
  }
}
