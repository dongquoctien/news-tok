import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { NextResponse, type NextRequest } from 'next/server'
import { readStoryboard, REPO_ROOT } from '@news-tok/render'
import { ffmpegBinary } from '@news-tok/media'
import { resolveDataPath } from '@news-tok/shared/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[id]/downloads/voice
 *
 * Concatenate every `segment.audio.narration` mp3 into a single
 * `voice.mp3` and serve it. Mirrors what the renderer does for the
 * full mp4 but for audio only — useful when users want to upload to
 * a podcast app or re-time the narration in another editor.
 *
 * Cached under `data/cache/downloads/<id>/voice.mp3`. Cache key
 * checks the latest narration mtime so swapping a TTS clip busts it.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let project
  try {
    project = await readStoryboard(params.id)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  // AssetRef.path is stored relative to data/ (new convention) but the
  // ffmpeg concat below needs absolute paths. resolveDataPath handles
  // both the new and legacy absolute form so unmigrated storyboards
  // still work.
  const narrationPaths = project.segments
    .map((s) => s.audio?.narration?.path)
    .map((p) => (p ? resolveDataPath(p) : undefined))
    .filter((p): p is string => !!p && existsSync(p))

  if (narrationPaths.length === 0) {
    return NextResponse.json(
      { error: 'no narration audio on any segment yet' },
      { status: 404 }
    )
  }

  const cacheDir = resolve(REPO_ROOT, 'data', 'cache', 'downloads', params.id)
  await mkdir(cacheDir, { recursive: true })
  const out = resolve(cacheDir, 'voice.mp3')

  // Stale if any source mp3 is newer than the cached concat.
  const newestSrc = Math.max(...narrationPaths.map((p) => statSync(p).mtimeMs))
  if (!existsSync(out) || statSync(out).mtimeMs < newestSrc) {
    await concatMp3s(narrationPaths, out)
  }

  const size = statSync(out).size
  const stream = createReadStream(out)
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${params.id}-voice.mp3"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}

async function concatMp3s(sources: string[], outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true })
  // ffmpeg's concat demuxer needs a manifest file. Write one with each
  // source path quoted. Use the same staging dir so it cleans up
  // alongside the output.
  const manifestPath = outPath + '.list'
  const manifest = sources
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n')
  writeFileSync(manifestPath, manifest, 'utf8')

  const bin = ffmpegBinary()
  await new Promise<void>((res, rej) => {
    const child = spawn(
      bin,
      ['-y', '-f', 'concat', '-safe', '0', '-i', manifestPath, '-c', 'copy', outPath],
      { stdio: 'ignore' }
    )
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))))
    child.on('error', rej)
  })
}
