import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { REPO_ROOT } from '@news-tok/render'
import { BUILT_IN_SFX } from '@news-tok/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SFX_DIR = resolve(REPO_ROOT, 'packages', 'shared', 'sfx')
const VALID_IDS = new Set(BUILT_IN_SFX.map((entry) => entry.id))

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  if (!VALID_IDS.has(id)) {
    return NextResponse.json({ error: 'unknown sfx id' }, { status: 404 })
  }
  const file = resolve(SFX_DIR, `${id}.mp3`)
  let stat
  try {
    stat = statSync(file)
  } catch {
    return NextResponse.json({ error: 'bank entry missing' }, { status: 404 })
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
