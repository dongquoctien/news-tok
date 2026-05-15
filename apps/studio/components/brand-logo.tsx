import Link from 'next/link'
import { Clapperboard } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Small brand mark shown in the top-left of every top-level page.
 * Anchors the header — without it Theme + Projects controls feel
 * "floating" on the right with nothing balancing them on the left.
 *
 * Clicks through to `/` so it doubles as a quick way home from the
 * Projects index.
 *
 * Sizing: kept compact (size-5 icon, text-sm) so the header height
 * matches the right-side ghost buttons (h-8). Hero callers can pass
 * their own brand mark — this one is for navigation chrome only.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        'inline-flex items-center gap-2 text-sm font-semibold tracking-tight',
        className
      )}
    >
      <Clapperboard
        aria-hidden
        className="news-tok-brand-icon size-5 text-primary"
        strokeWidth={2.25}
      />
      <span className="news-tok-brand">news-tok</span>
      <span className="text-foreground/60">Studio</span>
    </Link>
  )
}
