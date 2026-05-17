/**
 * GET /api/video-poster?path=<dataRelOrAbs>&at=<sec>
 *
 * Return a single JPEG frame extracted from a video, so the Studio
 * Library grid can show a poster for each clip without streaming the
 * raw mp4 into every <img> tile. Mirrors the contract of /api/peaks:
 * path-traversal guard against ALLOWED_ROOTS, content-hash cache so
 * the ffmpeg call only runs once per (file, atSec, width) tuple.
 *
 * Output: image/jpeg bytes, ~320px wide by default.
 *
 * Cache layout:
 *   data/cache/posters/<sha256(absPath + atSec + width).slice(0,24)>.jpg
 *
 * The cache key includes `at`/`width` so a user who later asks for a
 * different timecode gets a fresh extraction without invalidating the
 * existing poster.
 */
import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { extractThumbnail } from '@news-tok/media'
import { REPO_ROOT, dataDir } from '@news-tok/render'
import { resolveDataPath } from '@news-tok/shared/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROOTS = [
  resolve(REPO_ROOT, 'data', 'cache'),
  resolve(REPO_ROOT, 'data', 'projects'),
]

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv'])

const DEFAULT_AT_SEC = 1
const DEFAULT_WIDTH_PX = 320
// Cap defensively — extractThumbnail itself runs ffmpeg, so unbounded
// `at` values that overshoot the clip just produce the last frame, but
// a 4-figure width would force the JPEG to absurd dimensions for no UI
// benefit (the Library grid renders 4 columns inside a sidebar).
const MAX_WIDTH_PX = 640

function clampWidth(raw: string | null): number {
  if (!raw) return DEFAULT_WIDTH_PX
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH_PX
  return Math.min(MAX_WIDTH_PX, n)
}

function clampAt(raw: string | null): number {
  if (!raw) return DEFAULT_AT_SEC
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_AT_SEC
  // 10 minutes is more than any short-form clip will reasonably need.
  return Math.min(600, n)
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('path')
  if (!raw) {
    return NextResponse.json({ error: 'missing ?path' }, { status: 400 })
  }
  const atSec = clampAt(req.nextUrl.searchParams.get('at'))
  const widthPx = clampWidth(req.nextUrl.searchParams.get('width'))

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

  const posterDir = resolve(dataDir(), 'cache', 'posters')
  await mkdir(posterDir, { recursive: true })
  const cacheKey = createHash('sha256')
    .update(`${abs}|${atSec}|${widthPx}`)
    .digest('hex')
    .slice(0, 24)
  const cachePath = resolve(posterDir, `${cacheKey}.jpg`)

  let posterStat
  try {
    posterStat = statSync(cachePath)
  } catch {
    posterStat = undefined
  }
  if (!posterStat) {
    try {
      await extractThumbnail({
        videoPath: abs,
        outputPath: cachePath,
        atSec,
        widthPx,
      })
      posterStat = statSync(cachePath)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  const stream = createReadStream(cachePath)
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(posterStat.size),
      // Poster is keyed by absolute path + atSec + width. A different
      // video at the same path would hash to a different cache file,
      // so it's safe to mark immutable.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
