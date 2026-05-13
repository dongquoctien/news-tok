import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { projectSfxDir } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[id]/sfx/[slug] — stream a user-uploaded SFX
 * mp3 from `data/projects/<id>/sfx/<slug>.mp3`. Mirrors /api/sfx/[id]
 * for the built-in bank.
 *
 * The slug is validated to match the user-prefix convention so we
 * can't be tricked into serving arbitrary files via `..` traversal.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; slug: string } }
) {
  if (!/^user-[a-z0-9-]+$/i.test(params.slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 })
  }
  const file = resolve(projectSfxDir(params.id), `${params.slug}.mp3`)
  let stat
  try {
    stat = statSync(file)
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: 'not a file' }, { status: 400 })
  }
  const stream = createReadStream(file)
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
