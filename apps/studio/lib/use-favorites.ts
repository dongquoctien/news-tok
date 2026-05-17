'use client'

import { useEffect, useState } from 'react'
import type { FavoriteKind, FavoritesFile } from './favorites'

/**
 * Tiny shared client-side store for `~/.news-tok/favorites.json`.
 *
 * Design notes:
 *   - Module-level singleton so every picker on the page sees the
 *     same set without re-fetching. Studio mounts ~5 picker dialogs
 *     across the segment editor; without sharing they'd each hit
 *     `/api/favorites` on first open.
 *   - Subscribers are notified via a plain Set<Function> instead of
 *     pulling in a context provider — this hook is the only consumer.
 *   - Toggle does an optimistic update locally, then POSTs and
 *     reconciles with the server's response. Network failures revert.
 *
 * Returns:
 *   - `isFavorite(kind, id)` — synchronous check, false until the
 *     first fetch resolves.
 *   - `toggle(kind, id)` — optimistic toggle + server sync.
 *   - `list(kind)` — get the current id list for one kind (used by
 *     the filter chip to show "★ Yêu thích (n)" with a real count).
 *   - `loaded` — true once the initial fetch completes; pickers can
 *     hide the favorites UI on a brief flash to avoid jumping.
 */

const EMPTY: FavoritesFile = {
  version: 1,
  layouts: [],
  styles: [],
  fonts: [],
  music: [],
  sfx: [],
}

let cache: FavoritesFile = { ...EMPTY }
let loaded = false
let fetching: Promise<void> | null = null
const subscribers = new Set<() => void>()

function notify(): void {
  for (const fn of subscribers) fn()
}

async function fetchOnce(): Promise<void> {
  if (loaded) return
  if (fetching) return fetching
  fetching = (async () => {
    try {
      const res = await fetch('/api/favorites', { cache: 'no-store' })
      if (!res.ok) throw new Error(`favorites fetch ${res.status}`)
      const file = (await res.json()) as FavoritesFile
      cache = file
    } catch {
      // Network/JSON error — leave EMPTY in place. The UI shows zero
      // favorites, which is correct for a brand-new install and
      // recoverable on next toggle attempt.
    } finally {
      loaded = true
      fetching = null
      notify()
    }
  })()
  return fetching
}

async function postToggle(kind: FavoriteKind, id: string): Promise<FavoritesFile | null> {
  try {
    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    })
    if (!res.ok) return null
    return (await res.json()) as FavoritesFile
  } catch {
    return null
  }
}

export type UseFavoritesResult = {
  isFavorite: (kind: FavoriteKind, id: string) => boolean
  toggle: (kind: FavoriteKind, id: string) => Promise<void>
  list: (kind: FavoriteKind) => string[]
  loaded: boolean
}

export function useFavorites(): UseFavoritesResult {
  // Subscribe to module-level updates. We don't store the cache in
  // React state — instead we use a tick counter that bumps on every
  // notify(), forcing the component to re-read the cache.
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const cb = () => forceUpdate((n) => n + 1)
    subscribers.add(cb)
    void fetchOnce()
    return () => {
      subscribers.delete(cb)
    }
  }, [])

  return {
    isFavorite: (kind, id) => cache[kind].includes(id),
    list: (kind) => cache[kind],
    loaded,
    toggle: async (kind, id) => {
      // Optimistic local toggle first so the star + filter respond
      // instantly even on a slow connection.
      const before = cache[kind]
      const nextList = before.includes(id)
        ? before.filter((x) => x !== id)
        : [...before, id]
      cache = { ...cache, [kind]: nextList }
      notify()

      const server = await postToggle(kind, id)
      if (server) {
        cache = server
        notify()
      } else {
        // Server failed — revert to the pre-toggle state so the UI
        // doesn't lie about what's persisted.
        cache = { ...cache, [kind]: before }
        notify()
      }
    },
  }
}
