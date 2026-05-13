import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { projectDir, readStoryboard } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
}

function mimeFor(path: string): string {
  const i = path.lastIndexOf('.')
  return i < 0 ? 'application/octet-stream' : MIME[path.slice(i).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * GET /api/projects/[id]/logo/file — stream the watermark image for
 * Studio's <Player> and the picker preview. The path comes from
 * storyboard.logo.path; we re-derive it from project dir to avoid
 * trusting an arbitrary string from the storyboard.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let project
  try {
    project = await readStoryboard(params.id)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }
  if (!project.logo || project.logo.kind !== 'image') {
    return NextResponse.json({ error: 'no image watermark on this project' }, { status: 404 })
  }

  // Sanity check: the stored path must be inside the project's dir.
  const stored = resolve(project.logo.path)
  const dir = resolve(projectDir(params.id))
  if (!stored.startsWith(dir)) {
    return NextResponse.json({ error: 'logo path outside project dir' }, { status: 400 })
  }

  let stat
  try {
    stat = statSync(stored)
  } catch {
    return NextResponse.json({ error: 'logo file missing on disk' }, { status: 404 })
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: 'not a file' }, { status: 400 })
  }
  const stream = createReadStream(stored)
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': mimeFor(stored),
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
