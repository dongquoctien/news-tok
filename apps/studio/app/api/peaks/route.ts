/**
 * GET /api/peaks?path=<dataRelOrAbs>
 *
 * Return pre-computed waveform peaks for a music / sfx file so the
 * Studio bgMusic trimmer can draw a waveform without downloading the
 * raw mp3 to the browser. Output shape is whatever `extractPeaks`
 * produced (peaks number[], durationSec, sampleCount, version).
 *
 * Cache strategy: the `extractPeaks` helper already content-hash-caches
 * the JSON under `data/cache/peaks/<hash>.json`, so the slow ffmpeg
 * pipe runs at most once per (file, targetSamples) pair. On the wire
 * we additionally mark the response `immutable`-style so a Studio
 * page reload doesn't refetch.
 *
 * Path-traversal guard is identical to /api/asset — every input is
 * resolved against the allowed roots before reaching ffmpeg.
 */
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { extractPeaks } from '@news-tok/media'
import { REPO_ROOT } from '@news-tok/render'
import { resolveDataPath } from '@news-tok/shared/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROOTS = [
  resolve(REPO_ROOT, 'data', 'cache'),
  resolve(REPO_ROOT, 'data', 'projects'),
]

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'])

const MIN_SAMPLES = 100
const MAX_SAMPLES = 4000
const DEFAULT_SAMPLES = 1000

function clampSamples(raw: string | null): number {
  if (!raw) return DEFAULT_SAMPLES
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return DEFAULT_SAMPLES
  return Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, n))
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('path')
  if (!raw) {
    return NextResponse.json({ error: 'missing ?path' }, { status: 400 })
  }
  const targetSamples = clampSamples(req.nextUrl.searchParams.get('samples'))

  const abs = resolve(resolveDataPath(raw))
  const inRoot = ALLOWED_ROOTS.some(
    (root) => abs === root || abs.startsWith(root + '\\') || abs.startsWith(root + '/')
  )
  if (!inRoot) {
    return NextResponse.json({ error: 'path not allowed' }, { status: 403 })
  }

  const extIdx = abs.lastIndexOf('.')
  const ext = extIdx >= 0 ? abs.slice(extIdx).toLowerCase() : ''
  if (!AUDIO_EXTS.has(ext)) {
    return NextResponse.json(
      { error: `unsupported audio extension ${ext}` },
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

  try {
    const result = await extractPeaks(abs, { targetSamples })
    return NextResponse.json(result, {
      status: 200,
      headers: {
        // Content is keyed by content hash + targetSamples — caching forever
        // is safe; a different file under the same path would have a
        // different hash and a different cache file.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Duration-cap rejection from extractPeaks is the most common error;
    // surface it as 422 (unprocessable) so the UI can show a useful hint.
    const status = /exceeds limit/i.test(message) ? 422 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
