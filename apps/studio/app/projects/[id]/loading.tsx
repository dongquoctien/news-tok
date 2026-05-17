import { Clapperboard, Film, ListVideo, SlidersHorizontal } from 'lucide-react'

/**
 * Loading state for /projects/[id]. Editor SSR reads + validates the
 * full storyboard JSON, which can take 200–800ms on big projects
 * (custom SFX, large library, many segments). This file paints a
 * skeleton editor layout so the user sees structure immediately
 * instead of a blank page.
 *
 * The hero logo uses the same shimmer + clap animations as the
 * /projects index, scaled larger to feel like a "now opening" moment.
 */
export default function ProjectEditorLoading() {
  return (
    <div className="flex h-screen flex-col">
      {/* Header skeleton — matches the editor's actual banner so the
          row doesn't jump down when content arrives. */}
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <Clapperboard
            aria-hidden
            className="news-tok-brand-icon size-5 text-primary"
            strokeWidth={2.25}
          />
          <span className="news-tok-brand text-base">news-tok</span>
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-20 animate-pulse rounded bg-muted/60" />
          <div className="h-7 w-24 animate-pulse rounded bg-muted/60" />
        </div>
      </header>

      {/* Hero overlay centered above the skeleton body. The skeleton
          underneath fades in via opacity so the user perceives the
          page is "almost ready" rather than fully missing. */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* 3-column skeleton matching editor layout: timeline | player | inspector */}
        <aside className="hidden w-56 shrink-0 flex-col gap-2 border-r p-4 md:flex">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <ListVideo className="size-3.5" /> Timeline
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 w-full animate-pulse rounded-md bg-muted/50"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </aside>

        <main className="relative flex flex-1 items-center justify-center">
          {/* Player aspect placeholder */}
          <div className="aspect-[9/16] h-[60vh] max-h-[600px] animate-pulse rounded-lg bg-muted/40" />
          {/* Hero callout — sits over the player placeholder so the
              user reads it first. Uses brand animations + plain Vi
              text so the moment feels intentional. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm">
            <Clapperboard
              aria-hidden
              className="news-tok-brand-icon size-12 text-primary"
              strokeWidth={2.25}
            />
            <span className="news-tok-brand text-3xl">news-tok</span>
            <p className="text-sm text-muted-foreground">Đang mở dự án…</p>
            <p className="max-w-xs text-center text-[11px] text-muted-foreground/70">
              Đang đọc storyboard, kiểm tra phân cảnh và tải nhạc nền.
            </p>
          </div>
        </main>

        <aside className="hidden w-72 shrink-0 flex-col gap-3 border-l p-4 lg:flex">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <SlidersHorizontal className="size-3.5" /> Inspector
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2 w-16 animate-pulse rounded bg-muted/40" />
              <div
                className="h-8 w-full animate-pulse rounded-md bg-muted/50"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            </div>
          ))}
          <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground/60">
            <Film className="size-3.5" />
            <span>Variants will load shortly…</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
