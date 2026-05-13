import Link from 'next/link'
import { Clapperboard, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatePrompt } from '@/components/home/create-prompt'
import { ThemeToggle } from '@/components/theme/theme-toggle'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <Clapperboard
            aria-hidden
            className="news-tok-brand-icon size-6 text-primary"
            strokeWidth={2.25}
          />
          <span className="news-tok-brand">news-tok</span>
          <span className="text-foreground/70">Studio</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects">
              <FolderOpen />
              Projects
            </Link>
          </Button>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Turn a link into a short video
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Paste an article URL or article text. Claude drafts the storyboard,
          picks the visuals, and renders the video — all locally.
        </p>
        <CreatePrompt />
      </section>
    </main>
  )
}
