import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { REPO_ROOT } from '@news-tok/render'
import { resolveDataPath } from '@news-tok/shared/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Two roots map every legitimate asset class: the shared cache (Pexels,
// Edge TTS, Internet Archive) and per-project assets (library, sfx,
// scenes, output). We resolve the request path against DATA_DIR first
// (new relative form) and only fall back to the raw value if it's
// already absolute (legacy storyboards before the path-normalisation
// migration).
const ALLOWED_ROOTS = [resolve(REPO_ROOT, 'data', 'cache'), resolve(REPO_ROOT, 'data', 'projects')]

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function mimeFor(path: string): string {
  const i = path.lastIndexOf('.')
  if (i < 0) return 'application/octet-stream'
  return MIME[path.slice(i).toLowerCase()] ?? 'application/octet-stream'
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('path')
  if (!raw) {
    return NextResponse.json({ error: 'missing ?path' }, { status: 400 })
  }
  // resolveDataPath joins relative-to-data/ paths onto DATA_DIR and
  // passes absolute paths through. We then `resolve()` again to
  // normalise `..` segments before the ALLOWED_ROOTS prefix check.
  const abs = resolve(resolveDataPath(raw))
  if (!ALLOWED_ROOTS.some((root) => abs === root || abs.startsWith(root + '\\') || abs.startsWith(root + '/'))) {
    return NextResponse.json({ error: 'path not allowed' }, { status: 403 })
  }
  let stat
  try {
    stat = statSync(abs)
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: 'not a file' }, { status: 400 })
  }

  const stream = createReadStream(abs)
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': mimeFor(abs),
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
