import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { readStoryboard } from '@news-tok/render'
import { ProjectEditor } from './editor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function ProjectPage({ params }: { params: { id: string } }) {
  let initial
  try {
    initial = await readStoryboard(params.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <Link
          href="/projects"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Projects
        </Link>
        <h2 className="text-xl font-semibold">Project not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </main>
    )
  }

  return <ProjectEditor initial={initial} />
}
