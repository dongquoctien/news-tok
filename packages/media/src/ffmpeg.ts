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
