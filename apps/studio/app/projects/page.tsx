import Link from 'next/link'
import { ArrowLeft, Film, Layers, Languages, CheckCircle2, Terminal, Sparkles } from 'lucide-react'
import { listProjects } from '@news-tok/render'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ProjectActions } from '@/components/studio/project-actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} h ago`
  const d = Math.floor(hr / 24)
  return `${d} d ago`
}

export default async function ProjectsListPage() {
  const projects = await listProjects()

  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Home
      </Link>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">Projects</h2>
        <span className="text-sm text-muted-foreground">{projects.length} total</span>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="size-5" />
              No projects yet
            </CardTitle>
            <CardDescription>
              Projects are created from the Claude CLI. Open a terminal in this repo and run{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm">claude</code>, then ask
              it to create a video from a URL or text.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.projectId}
              className="group relative h-full transition-colors hover:border-primary/60"
            >
              <Link href={`/projects/${p.projectId}`} className="block">
                <CardHeader>
                  <CardTitle className="line-clamp-2 break-words pr-20 text-base">
                    {p.title}
                  </CardTitle>
                  <CardDescription>{relativeTime(p.updatedAt)}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Film className="size-4" />
                    {p.aspect}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="size-4" />
                    {p.segmentCount} segs
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Languages className="size-4" />
                    {p.language}
                  </span>
                  {p.outputVariantIds.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      {p.outputVariantIds.length}
                      {p.declaredVariantIds.length > 0
                        ? `/${p.declaredVariantIds.length}`
                        : ''}{' '}
                      rendered
                    </span>
                  ) : p.hasOutput ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      rendered
                    </span>
                  ) : p.declaredVariantIds.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground/80">
                      <Sparkles className="size-4" />
                      {p.declaredVariantIds.length} variants
                    </span>
                  ) : (
                    <span />
                  )}
                </CardContent>
              </Link>
              <div className="absolute right-3 top-3">
                <ProjectActions projectId={p.projectId} title={p.title} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
