import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

function bin(): string {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not provide a binary for this platform')
  }
  return ffmpegPath
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const proc = spawn(bin(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    proc.on('error', rejectRun)
    proc.on('close', (code) => {
      if (code === 0) {
        resolveRun()
      } else {
        const tail = stderr.split(/\r?\n/).slice(-12).join('\n')
        rejectRun(new Error(`ffmpeg exited ${code}\n${tail}`))
      }
    })
  })
}

export type ConcatOptions = {
  /** Re-encode while concatenating (slower, but tolerant of codec mismatch). */
  reencode?: boolean
}

export type ExtractThumbnailOptions = {
  /** Source video path. */
  videoPath: string
  /** Where to write the JPEG thumbnail. */
  outputPath: string
  /** Timestamp to grab in seconds. Defaults to 1 (skip the cold-open fade). */
  atSec?: number
  /** Target width; height auto-scales to preserve aspect ratio. */
  widthPx?: number
}

/**
 * Grab a single JPEG frame from a video. Used by the project list to
 * surface a thumbnail per rendered variant without bundling a heavier
 * still-frame pipeline.
 */
export async function extractThumbnail(opts: ExtractThumbnailOptions): Promise<string> {
  await mkdir(dirname(opts.outputPath), { recursive: true })
  const at = opts.atSec ?? 1
  const width = opts.widthPx ?? 320
  await runFfmpeg([
    '-y',
    '-ss',
    String(at),
    '-i',
    opts.videoPath,
    '-vframes',
    '1',
    '-vf',
    `scale=${width}:-1`,
    '-q:v',
    '5',
    opts.outputPath,
  ])
  return opts.outputPath
}

/**
 * Concatenate a sequence of video files into `outputPath` using ffmpeg's
 * concat demuxer. All inputs should share codec/timebase/resolution; if not,
 * pass `reencode: true`.
 */
export async function concat(
  inputPaths: string[],
  outputPath: string,
  options: ConcatOptions = {}
): Promise<string> {
  if (inputPaths.length === 0) {
    throw new Error('concat: no input files')
  }
  await mkdir(dirname(outputPath), { recursive: true })

  const manifestPath = `${outputPath}.concat.txt`
  const manifest = inputPaths
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, `'\\''`)}'`)
    .join('\n')
  await writeFile(manifestPath, manifest, 'utf8')

  const args = [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    manifestPath,
    ...(options.reencode
      ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac']
      : ['-c', 'copy']),
    outputPath,
  ]
  try {
    await runFfmpeg(args)
  } finally {
    await rm(manifestPath, { force: true })
  }
  return outputPath
}

export type MixAudioOptions = {
  videoPath: string
  /** Background music track — looped or trimmed to match video length. */
  bgMusicPath?: string
  /** 0..1 — defaults to 0.2. */
  bgMusicVolume?: number
  outputPath: string
}

/**
 * Mux background music into a video while preserving the existing narration
 * track. If `bgMusicPath` is omitted, just copies the source.
 */
export async function mixAudio(opts: MixAudioOptions): Promise<string> {
  await mkdir(dirname(opts.outputPath), { recursive: true })
  if (!opts.bgMusicPath) {
    await runFfmpeg(['-y', '-i', opts.videoPath, '-c', 'copy', opts.outputPath])
    return opts.outputPath
  }
  const vol = opts.bgMusicVolume ?? 0.2
  const args = [
    '-y',
    '-i',
    opts.videoPath,
    '-stream_loop',
    '-1',
    '-i',
    opts.bgMusicPath,
    '-filter_complex',
    `[1:a]volume=${vol}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    opts.outputPath,
  ]
  await runFfmpeg(args)
  return opts.outputPath
}

export function ffmpegBinary(): string {
  return bin()
}

/**
 * Probe a media file for its duration in seconds. Uses the ffmpeg binary
 * (which prints `Duration: HH:MM:SS.MS` on stderr when called with no
 * output target) so we don't need a separate ffprobe install — ffmpeg-static
 * ships only `ffmpeg.exe`.
 */
export async function probeDurationSec(path: string): Promise<number> {
  const stderr = await runFfmpegProbe(path)
  return parseDurationFromStderr(stderr)
}

export type VideoMetadata = {
  /** Total duration in seconds. */
  durationSec: number
  /** Frame width in pixels — undefined if no video stream was detected. */
  width?: number
  /** Frame height in pixels — undefined if no video stream was detected. */
  height?: number
}

/**
 * Probe a video file for duration + frame dimensions in one ffmpeg call.
 * Used by the Studio library upload route to populate AssetRef metadata
 * (`durationSec` so the renderer can loop the clip; `width`/`height` so
 * Studio can pick a fitting thumbnail size).
 *
 * Reuses the same `ffmpeg -i ... -f null -` trick as `probeDurationSec`
 * so we don't need a separate ffprobe binary (ffmpeg-static ships only
 * `ffmpeg.exe`). Dimensions come from the `Stream #0:0(...): Video: ...
 * <w>x<h>` line ffmpeg prints to stderr alongside the duration.
 */
export async function probeVideoMetadata(path: string): Promise<VideoMetadata> {
  const stderr = await runFfmpegProbe(path)
  const durationSec = parseDurationFromStderr(stderr)
  // Match the first "Video:" stream line and pull WxH out of it. ffmpeg
  // sometimes appends " [SAR ...]" after the dimensions so we anchor on
  // a comma or space boundary after the trailing digit.
  const dimMatch = stderr.match(/Video:[^\n]*?\s(\d{2,5})x(\d{2,5})(?:[\s,\]]|$)/)
  if (!dimMatch) return { durationSec }
  return {
    durationSec,
    width: Number.parseInt(dimMatch[1]!, 10),
    height: Number.parseInt(dimMatch[2]!, 10),
  }
}

function runFfmpegProbe(path: string): Promise<string> {
  return new Promise<string>((resolveRun, rejectRun) => {
    const proc = spawn(bin(), ['-hide_banner', '-i', path, '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let buf = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
    })
    proc.on('error', rejectRun)
    proc.on('close', () => resolveRun(buf))
  })
}

function parseDurationFromStderr(stderr: string): number {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) throw new Error('Could not parse duration from ffmpeg output')
  const hours = Number.parseInt(match[1]!, 10)
  const minutes = Number.parseInt(match[2]!, 10)
  const seconds = Number.parseFloat(match[3]!)
  return hours * 3600 + minutes * 60 + seconds
}
