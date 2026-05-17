'use client'

import { Star } from 'lucide-react'
import type { FavoriteKind } from '@/lib/favorites'
import { useFavorites } from '@/lib/use-favorites'
import { cn } from '@/lib/utils'

/**
 * Star button rendered in the corner of every picker card. Click
 * toggles favorite; visual stays in sync via the shared store.
 *
 * Click stops propagation so it doesn't also fire the parent card's
 * onSelect — important inside dialogs where the card click "picks"
 * and we don't want starring to immediately select-and-apply.
 *
 * The button is positioned absolutely; callers should put it inside
 * a `relative`-positioned parent. Default placement is top-right but
 * the `className` prop lets the caller override (e.g. top-left for
 * cards where the top-right already has a "selected" check badge).
 */
export function FavoriteStar({
  kind,
  id,
  className,
}: {
  kind: FavoriteKind
  id: string
  /** Tailwind classes to override positioning + colour. */
  className?: string
}) {
  const { isFavorite, toggle, loaded } = useFavorites()
  const fav = isFavorite(kind, id)

  return (
    <button
      type="button"
      aria-label={fav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
      aria-pressed={fav}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (!loaded) return
        void toggle(kind, id)
      }}
      className={cn(
        'absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur transition-colors hover:bg-black/75',
        fav ? 'text-amber-300' : 'text-white/70',
        className
      )}
    >
      <Star
        className={cn('size-4', fav ? 'fill-amber-300 stroke-amber-300' : 'fill-none')}
        strokeWidth={2.2}
      />
    </button>
  )
}

/**
 * Filter chip sitting in the dialog header. Click toggles
 * "favourites only" view. Shows the count so the user can tell at
 * a glance whether they have any favorites yet.
 *
 * When count = 0 the chip is disabled with a hint, so a first-time
 * user doesn't click into an empty filtered view and get confused.
 */
export function FavoritesFilterChip({
  kind,
  active,
  onToggle,
}: {
  kind: FavoriteKind
  active: boolean
  onToggle: (next: boolean) => void
}) {
  const { list, loaded } = useFavorites()
  const count = list(kind).length
  const disabled = loaded && count === 0

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return
        onToggle(!active)
      }}
      disabled={disabled}
      aria-pressed={active}
      title={
        disabled
          ? 'Chưa có mục yêu thích nào — bấm sao trên thẻ để thêm'
          : active
            ? 'Bỏ lọc — hiện tất cả'
            : 'Chỉ hiện mục yêu thích'
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-300'
          : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-secondary/30'
      )}
    >
      <Star
        className={cn('size-3.5', active && 'fill-amber-400 stroke-amber-500')}
        strokeWidth={2.2}
      />
      Yêu thích
      {loaded ? <span className="text-[10px] opacity-70">({count})</span> : null}
    </button>
  )
}

/**
 * Sort helper — favorites first (in insertion order), then the rest in
 * original order. Used by pickers that don't filter but still want to
 * surface favorites at the top. Picker UIs that filter pass through
 * this AFTER applying the filter so the sort is stable in both modes.
 */
export function sortFavoritesFirst<T>(
  items: T[],
  getId: (item: T) => string,
  favorites: string[]
): T[] {
  if (favorites.length === 0) return items
  const favSet = new Set(favorites)
  const favs = items.filter((it) => favSet.has(getId(it)))
  // Preserve the user's insertion order from the favorites list (not
  // the items array order). This way the last-favorited item shows up
  // last in the favorites strip, which matches what the user did.
  favs.sort(
    (a, b) => favorites.indexOf(getId(a)) - favorites.indexOf(getId(b))
  )
  const rest = items.filter((it) => !favSet.has(getId(it)))
  return [...favs, ...rest]
}
