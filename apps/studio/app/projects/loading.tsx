import { Clapperboard } from 'lucide-react'

/**
 * Loading state for /projects. Renders instantly while the Server
 * Component awaits `listProjects()` + reads each storyboard.json off
 * disk (≈500ms–2s on a busy data dir). Without this file Next.js
 * shows a blank screen during that window.
 *
 * The visual reuses the `news-tok-brand` shimmer + `news-tok-clap`
 * keyframes already defined in globals.css so the loading state
 * feels like a deliberate intro, not a stalled fetch. Both animations
 * respect `prefers-reduced-motion`.
 */
export default function ProjectsLoading() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col items-center justify-center gap-6 px-6 py-12">
      {/* Hero logo + wordmark. The wrapper sits the icon next to the
          text so the clap rotation is anchored to the same baseline
          as the shimmer-animated text. */}
      <div className="flex items-center gap-4">
        <Clapperboard
          aria-hidden
          className="news-tok-brand-icon size-14 text-primary"
          strokeWidth={2.25}
        />
        <span className="news-tok-brand text-5xl">news-tok</span>
      </div>

      <p className="text-sm text-muted-foreground">Đang tải danh sách dự án…</p>

      {/* Skeleton list — three rows shaped roughly like the real
          ProjectCard grid so the layout doesn't jump when content
          arrives. The bars pulse via tailwindcss-animate's animate-pulse,
          not the brand shimmer, to differentiate "logo is alive" from
          "this row is loading". */}
      <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="flex flex-col gap-2 rounded-lg border bg-card/50 p-3"
          >
            <div className="aspect-[9/16] w-full animate-pulse rounded-md bg-muted/60" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-muted/40" />
          </li>
        ))}
      </ul>
    </div>
  )
}
