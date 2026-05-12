import { NextResponse, type NextRequest } from 'next/server'
import { ProjectSchema, type Project } from '@news-tok/shared/schema'
import { fitSegmentDurations, stripEmoji } from '@news-tok/shared/sanitize'
import { deleteProject, readStoryboard, writeStoryboard } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sanitize(project: Project): Project {
  return {
    ...project,
    title: stripEmoji(project.title),
    segments: project.segments.map((s) => ({
      ...s,
      text: stripEmoji(s.text),
    })),
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const project = await readStoryboard(params.id)
    return NextResponse.json(project)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.toLowerCase().includes('enoent') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteProject(params.id)
    return NextResponse.json({ deleted: params.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const parsed = ProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid storyboard',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      )
    }
    if (parsed.data.id !== params.id) {
      return NextResponse.json(
        { error: `Project id mismatch: ${parsed.data.id} vs ${params.id}` },
        { status: 400 }
      )
    }
    const cleaned = sanitize({ ...parsed.data, updatedAt: new Date().toISOString() })
    // Defence in depth: even if the client forgets to stretch a segment to
    // fit narration, normalise here so the storyboard durations always
    // match what the renderer will play.
    const { project: next } = fitSegmentDurations(cleaned)
    await writeStoryboard(params.id, next)
    return NextResponse.json(next)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
