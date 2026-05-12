import { existsSync } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { extractThumbnail } from '@news-tok/media'
import { projectDir } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[id]/thumb?variant=A
 *
 * Returns a 320px-wide JPEG snapshot of `output-<variant>.mp4` (or
 * `output.mp4` when `variant` is omitted). The result is cached on disk
 * at `data/projects/<id>/.thumbs/<variant>.jpg`; subsequent requests
 * stream the cached file without invoking ffmpeg. The cache is
 * invalidated automatically when the source mp4's mtime is newer than
 * the thumbnail's.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const variant = req.nextUrl.searchParams.get('variant') ?? null
  const dir = projectDir(params.id)
  if (!existsSync(dir)) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }
  const videoName = variant ? `output-${variant}.mp4` : 'output.mp4'
  const videoPath = resolve(dir, videoName)
  if (!existsSync(videoPath)) {
    return NextResponse.json({ error: 'no render for this variant' }, { status: 404 })
  }

  const thumbDir = resolve(dir, '.thumbs')
  await mkdir(thumbDir, { recursive: true })
  const thumbPath = resolve(thumbDir, `${variant ?? 'default'}.jpg`)

  // Stale-while-revalidate: skip the ffmpeg invocation when the cached
  // thumbnail is newer than the source mp4.
  let needsRebuild = true
  if (existsSync(thumbPath)) {
    try {
      const [t, v] = await Promise.all([stat(thumbPath), stat(videoPath)])
      if (t.mtimeMs >= v.mtimeMs) needsRebuild = false
    } catch {
      // fall through and rebuild
    }
  }

  if (needsRebuild) {
    try {
      await extractThumbnail({ videoPath, outputPath: thumbPath, atSec: 1, widthPx: 320 })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  const buf = await readFile(thumbPath)
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
