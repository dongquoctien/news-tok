import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { REPO_ROOT } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROOTS = [resolve(REPO_ROOT, 'data', 'cache'), resolve(REPO_ROOT, 'data', 'projects')]

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
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
  const abs = resolve(raw)
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
