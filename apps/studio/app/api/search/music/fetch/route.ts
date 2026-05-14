import { NextResponse, type NextRequest } from 'next/server'
import { archive } from '@news-tok/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/search/music/fetch
 * Body: { identifier, fileName, title?, creator?, durationSec? }
 *
 * Resolve a candidate previously surfaced by /api/search/music/list
 * to a cached AssetRef. Called after the user clicks Apply on the
 * audition card — only this track downloads, not the eight on the
 * grid.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const cand = body as {
    identifier?: string
    fileName?: string
    title?: string
    creator?: string
    durationSec?: number
  }
  if (!cand.identifier || !cand.fileName) {
    return NextResponse.json(
      { error: 'identifier and fileName are required' },
      { status: 400 }
    )
  }
  try {
    const asset = await archive.fetchMusic({
      identifier: cand.identifier,
      fileName: cand.fileName,
      title: cand.title,
      creator: cand.creator,
      durationSec: cand.durationSec,
    })
    return NextResponse.json({ asset })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
