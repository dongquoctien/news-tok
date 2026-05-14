import Link from 'next/link'
import { ArrowLeft, Terminal } from 'lucide-react'
import { listProjects } from '@news-tok/render'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ProjectsGrid } from '@/components/studio/projects-grid'
import { ThemeToggle } from '@/components/theme/theme-toggle'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function ProjectsListPage() {
  const projects = await listProjects()

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
        <ThemeToggle />
      </div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight">
          {projects.length} project{projects.length === 1 ? '' : 's'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The system will delete videos and projects after 30 days. After your
          video is finished, please download it.
        </p>
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
        <ProjectsGrid projects={projects} />
      )}
    </main>
  )
}
