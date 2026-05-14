import { NextResponse, type NextRequest } from 'next/server'
import { archive } from '@news-tok/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/search/music/list?mood=calm&duration=30&limit=8
 *
 * Returns up to N candidate tracks for the given mood. Each candidate
 * carries the archive.org stream URL so the picker can audition without
 * forcing a download to cache. Only the track the user actually applies
 * is downloaded — via POST /api/search/music/fetch.
 *
 * archive only — pixabay's music API is deprecated (404) and the
 * crawler-based providers don't expose a list endpoint.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mood = sp.get('mood')
  const durationParam = sp.get('duration')
  if (!mood || !durationParam) {
    return NextResponse.json(
      { error: 'mood and duration are required' },
      { status: 400 }
    )
  }
  const durationSec = Number.parseFloat(durationParam)
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return NextResponse.json(
      { error: 'duration must be a positive number' },
      { status: 400 }
    )
  }
  const limit = Number.parseInt(sp.get('limit') ?? '8', 10)
  try {
    const tracks = await archive.listMusic({
      mood,
      durationSec,
      limit: Number.isFinite(limit) ? limit : 8,
    })
    return NextResponse.json({ tracks })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
