import { FolderPlus } from 'lucide-react'
import { listProjects } from '@news-tok/render'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ProjectsGrid } from '@/components/studio/projects-grid'
import { NewProjectButton } from '@/components/studio/new-project-button'
import { BrandLogo } from '@/components/brand-logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function ProjectsListPage() {
  const projects = await listProjects()

  return (
    <main className="flex min-h-screen flex-col">
      {/* Same nav header as home. BrandLogo doubles as the "back to
          home" affordance — clicking it goes to `/`. The New project
          button lives here so it's always one click away regardless of
          how many projects are listed below. */}
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <BrandLogo />
        <div className="flex items-center gap-2">
          <NewProjectButton />
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl flex-1 p-8">
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
                <FolderPlus className="size-5" />
                No projects yet
              </CardTitle>
              <CardDescription className="space-y-3">
                <p>
                  Tạo project trống ngay tại đây, hoặc quay về{' '}
                  <a href="/" className="underline hover:text-foreground">
                    trang chủ
                  </a>{' '}
                  để dán link bài báo và để AI dựng kịch bản giúp bạn.
                </p>
                <div>
                  <NewProjectButton label="Tạo project đầu tiên" />
                </div>
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ProjectsGrid projects={projects} />
        )}
      </section>
    </main>
  )
}
