import { existsSync, statSync, createReadStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { NextResponse, type NextRequest } from 'next/server'
import { REPO_ROOT } from '@news-tok/render'
import { ffmpegBinary } from '@news-tok/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[id]/downloads/thumbnail
 *
 * Extract a single frame at ~0.5s from the project's default mp4
 * (`output.mp4` or first variant) into `data/cache/downloads/<id>/
 * thumbnail.png`. The result is cached by hashing the mp4 path +
 * mtime so a re-render busts the cache automatically.
 *
 * Used by the projects-page card's Thumbnail download pill so users
 * can grab a poster image for social posts (Facebook needs an
 * explicit thumb upload).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const projectDir = resolve(REPO_ROOT, 'data', 'projects', params.id)
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }
  const mp4 = pickDefaultMp4(projectDir)
  if (!mp4) {
    return NextResponse.json({ error: 'no rendered output yet' }, { status: 404 })
  }
  const cacheDir = resolve(REPO_ROOT, 'data', 'cache', 'downloads', params.id)
  await mkdir(cacheDir, { recursive: true })
  const out = resolve(cacheDir, 'thumbnail.png')
  // Cheap "freshness check": cache file must be newer than the mp4 it
  // came from. Re-render → mp4 mtime bumps → thumbnail re-extracts.
  const mp4Stat = statSync(mp4)
  if (!existsSync(out) || statSync(out).mtimeMs < mp4Stat.mtimeMs) {
    await extractFrame(mp4, out, 0.5)
  }
  return streamFile(out, 'image/png', `${params.id}-thumbnail.png`)
}

function pickDefaultMp4(projectDir: string): string | undefined {
  const legacy = resolve(projectDir, 'output.mp4')
  if (existsSync(legacy)) return legacy
  // Pick the first output-<id>.mp4 by alphabetical order. summarize()
  // uses the same rule so the served thumb matches the served preview.
  const fs = require('node:fs') as typeof import('node:fs')
  const entries = fs.readdirSync(projectDir, { withFileTypes: true })
  const variants = entries
    .filter((e) => e.isFile() && /^output-[A-Za-z0-9_-]+\.mp4$/.test(e.name))
    .map((e) => e.name)
    .sort()
  return variants[0] ? resolve(projectDir, variants[0]) : undefined
}

async function extractFrame(mp4Path: string, outPath: string, seconds: number): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true })
  const bin = ffmpegBinary()
  await new Promise<void>((res, rej) => {
    const child = spawn(
      bin,
      ['-y', '-ss', String(seconds), '-i', mp4Path, '-frames:v', '1', '-q:v', '3', outPath],
      { stdio: 'ignore' }
    )
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))))
    child.on('error', rej)
  })
}

function streamFile(path: string, contentType: string, downloadAs: string): Response {
  const size = statSync(path).size
  const stream = createReadStream(path)
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${downloadAs}"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
