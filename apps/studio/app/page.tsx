import Link from 'next/link'
import { Clapperboard, FolderOpen, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-12 text-center">
      <h1 className="flex items-center justify-center gap-3 text-5xl font-semibold tracking-tight">
        <Clapperboard
          aria-hidden
          className="news-tok-brand-icon size-12 text-primary"
          strokeWidth={2.25}
        />
        <span className="news-tok-brand">news-tok</span>
        <span className="text-foreground/80">Studio</span>
      </h1>
      <p className="max-w-xl text-muted-foreground">
        Local editor for short video projects. Projects are created via the Claude CLI from your
        terminal, then opened here to preview and fine-tune.
      </p>
      <div className="flex items-center gap-4">
        <Button asChild>
          <Link href="/projects">
            <FolderOpen />
            Open projects
          </Link>
        </Button>
        <span className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <Terminal className="size-4" />
          $ claude
        </span>
      </div>
    </main>
  )
}
