/**
 * GET /api/video-filmstrip?path=<dataRelOrAbs>&count=8&width=160
 *
 * Return a list of evenly-spaced poster timecodes for a video, so the
 * VideoEditor's trim slider can render a filmstrip backdrop (the
 * CapCut / Premiere pattern). Each entry points back at
 * /api/video-poster, which content-hash-caches the actual JPEG — so
 * this endpoint is cheap to call and never holds frame data in
 * memory.
 *
 * Output:
 *   { durationSec: number,
 *     frames: Array<{ atSec: number, url: string }> }
 *
 * The `url` field is already encoded against /api/video-poster, so
 * the client can drop it straight into <img src={frame.url}>.
 *
 * Path-traversal + video-ext guards mirror /api/video-poster.
 */
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { probeDurationSec } from '@news-tok/media'
import { REPO_ROOT } from '@news-tok/render'
import { resolveDataPath } from '@news-tok/shared/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROOTS = [
  resolve(REPO_ROOT, 'data', 'cache'),
  resolve(REPO_ROOT, 'data', 'projects'),
]

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv'])

const DEFAULT_COUNT = 8
const MIN_COUNT = 4
// 16 is plenty for a 1000px-wide filmstrip strip; more frames just
// hammer ffmpeg without buying visible resolution.
const MAX_COUNT = 16
const DEFAULT_WIDTH = 160

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  if (!raw) return def
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('path')
  if (!raw) {
    return NextResponse.json({ error: 'missing ?path' }, { status: 400 })
  }
  const count = clampInt(req.nextUrl.searchParams.get('count'), DEFAULT_COUNT, MIN_COUNT, MAX_COUNT)
  const width = clampInt(req.nextUrl.searchParams.get('width'), DEFAULT_WIDTH, 80, 480)

  const abs = resolve(resolveDataPath(raw))
  const inRoot = ALLOWED_ROOTS.some(
    (root) => abs === root || abs.startsWith(root + '\\') || abs.startsWith(root + '/')
  )
  if (!inRoot) {
    return NextResponse.json({ error: 'path not allowed' }, { status: 403 })
  }

  const extIdx = abs.lastIndexOf('.')
  const ext = extIdx >= 0 ? abs.slice(extIdx).toLowerCase() : ''
  if (!VIDEO_EXTS.has(ext)) {
    return NextResponse.json(
      { error: `unsupported video extension ${ext}` },
      { status: 400 }
    )
  }

  try {
    const stat = statSync(abs)
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'not a file' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let durationSec: number
  try {
    durationSec = await probeDurationSec(abs)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }

  // Evenly spaced timecodes inset by half-step so we don't grab the
  // black opening / closing frames a lot of editorial clips have. For
  // count=8 in a 4s clip this lands at t = 0.25, 0.75, …, 3.75s.
  const step = durationSec / count
  const frames = Array.from({ length: count }, (_, i) => {
    const atSec = step * (i + 0.5)
    const url = `/api/video-poster?path=${encodeURIComponent(raw)}&at=${atSec.toFixed(3)}&width=${width}`
    return { atSec, url }
  })

  return NextResponse.json(
    { durationSec, frames },
    {
      status: 200,
      headers: {
        // Filmstrip is keyed by (path, count, width). A different file
        // at the same path would re-hash inside /api/video-poster, so
        // immutable is safe here.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  )
}
