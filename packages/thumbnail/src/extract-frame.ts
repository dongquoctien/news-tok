import { mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

/**
 * Extract up to N still frames from a video at evenly-spaced timestamps
 * (10/30/50/70/90% by default for N=5). Frames land under
 * `<outDir>/frame-<index>.jpg` and are cached by source mtime — calling
 * again with the same video file is a no-op unless the file changed.
 */

export type ExtractFramesInput = {
  videoPath: string
  outDir: string
  /** How many evenly-spaced frames to grab. Default 5. */
  count?: number
  /** Width of each thumbnail (height auto). Default 540 (half of 1080). */
  widthPx?: number
}

export type ExtractedFrame = {
  path: string
  atSec: number
  index: number
}

function ffmpegBin(): string {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary for this platform')
  return ffmpegPath
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const proc = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    proc.on('error', rejectRun)
    proc.on('close', (code) => {
      if (code === 0) resolveRun()
      else rejectRun(new Error(`ffmpeg exited ${code}\n${stderr.split(/\r?\n/).slice(-10).join('\n')}`))
    })
  })
}

function probeDuration(videoPath: string): Promise<number> {
  return new Promise<number>((resolveRun, rejectRun) => {
    const proc = spawn(ffmpegBin(), ['-hide_banner', '-i', videoPath, '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let buf = ''
    proc.stderr.on('data', (c: Buffer) => {
      buf += c.toString('utf8')
    })
    proc.on('error', rejectRun)
    proc.on('close', () => {
      const m = buf.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (!m) {
        rejectRun(new Error('Could not parse duration from ffmpeg output'))
        return
      }
      const h = Number.parseInt(m[1]!, 10)
      const mn = Number.parseInt(m[2]!, 10)
      const s = Number.parseFloat(m[3]!)
      resolveRun(h * 3600 + mn * 60 + s)
    })
  })
}

/** Default timestamps: 10/30/50/70/90% rendered as fractions of duration. */
function defaultTimestamps(count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [0.5]
  const out: number[] = []
  const step = 0.8 / (count - 1)
  for (let i = 0; i < count; i++) out.push(0.1 + step * i)
  return out
}

export async function extractFrames(input: ExtractFramesInput): Promise<ExtractedFrame[]> {
  const { videoPath, outDir } = input
  if (!existsSync(videoPath)) throw new Error(`Source video not found: ${videoPath}`)
  const count = input.count ?? 5
  const width = input.widthPx ?? 540

  await mkdir(outDir, { recursive: true })

  // Cache key: source mtime so re-extracting is a no-op when the video
  // file hasn't changed. Stored next to the frames as `.source-mtime`.
  const srcStat = await stat(videoPath)
  const sentinelPath = resolve(outDir, '.source-mtime')
  let cacheHit = false
  if (existsSync(sentinelPath)) {
    try {
      const { readFile } = await import('node:fs/promises')
      const prev = (await readFile(sentinelPath, 'utf8')).trim()
      if (prev === String(srcStat.mtimeMs)) cacheHit = true
    } catch {
      cacheHit = false
    }
  }

  const duration = await probeDuration(videoPath)
  const fractions = defaultTimestamps(count)
  const frames: ExtractedFrame[] = []

  for (let i = 0; i < fractions.length; i++) {
    const frac = fractions[i]!
    const atSec = Math.max(0, Math.min(duration - 0.1, duration * frac))
    const outPath = resolve(outDir, `frame-${i}.jpg`)
    if (!cacheHit || !existsSync(outPath)) {
      await runFfmpeg([
        '-y',
        '-ss',
        atSec.toFixed(3),
        '-i',
        videoPath,
        '-vframes',
        '1',
        '-vf',
        `scale=${width}:-1`,
        '-q:v',
        '4',
        outPath,
      ])
    }
    frames.push({ path: outPath, atSec, index: i })
  }

  // Write the sentinel last so a crash midway through re-extracts on
  // the next call.
  if (!cacheHit) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(sentinelPath, String(srcStat.mtimeMs), 'utf8')
  }

  return frames
}

/**
 * Extract the "best" single frame for a layout — picks the timestamp
 * closest to the layout's preferred focal position. Used when the
 * caller just wants one frame, not a candidate pool.
 */
export async function extractBestFrame(input: ExtractFramesInput): Promise<ExtractedFrame> {
  const frames = await extractFrames({ ...input, count: 1 })
  if (frames.length === 0) throw new Error('extractFrames returned 0 frames')
  return frames[0]!
}

export { dirname as _dirname }
