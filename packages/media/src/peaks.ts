/**
 * Waveform peaks extractor for the Studio background-music trimmer UI.
 *
 * Output shape: `number[]` of length `targetSamples` (default 1000), each in
 * [0, 1] — the max absolute amplitude inside the corresponding time bin.
 * 1000 samples is enough resolution to draw a 1000px-wide canvas cleanly
 * and stays ~2KB after JSON encoding for a 3-minute track.
 *
 * Why max (and not RMS): users want to *see* the loud moments — the chorus
 * spike, the kick drum hit — so they can pick a trim region that lands on
 * the energetic part of the song. RMS averages those spikes away into a
 * flat envelope that looks like every track has the same dynamics.
 *
 * Implementation:
 *   ffmpeg -i in.mp3 -ac 1 -filter:a aresample=8000 -f f32le -
 *      | Float32Array
 *      | bin to targetSamples
 *      | per-bin Math.max(|sample|)
 *
 * 8kHz mono is plenty for visual peaks — the original 44.1kHz stereo gets
 * us nothing the eye can see and slows the ffmpeg pipe ~5x. f32le is the
 * smallest format we can read without an extra decode step.
 */
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { cacheKey, cacheExists, cachePath, writeAtomic } from './cache.js'
import { probeDurationSec } from './ffmpeg.js'

export type PeaksResult = {
  /** Per-bin max absolute amplitude in [0, 1]. */
  peaks: number[]
  /** Total source duration in seconds, from ffmpeg probe. */
  durationSec: number
  /** How many peak bins are in `peaks` (= peaks.length, exposed for clarity). */
  sampleCount: number
  /** Schema version — bump if we change the binning algorithm so old
   *  cache entries can be evicted by callers that care. */
  version: 1
}

export type ExtractPeaksOptions = {
  /** Defaults to 1000. Don't go above 4000 — canvases that wide render slow. */
  targetSamples?: number
  /**
   * Reject inputs longer than this. No legitimate short-form video uses
   * a music bed longer than 15 minutes; cap defensively so a stray
   * podcast episode upload doesn't tie up ffmpeg for a minute.
   */
  maxDurationSec?: number
}

const DEFAULT_TARGET_SAMPLES = 1000
const DEFAULT_MAX_DURATION_SEC = 15 * 60

function bin(): string {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not provide a binary for this platform')
  }
  return ffmpegPath
}

/**
 * Pipe the input through ffmpeg, downmix to mono 8kHz f32le, and collect
 * every float into a single Float32Array. Reasonably memory-cheap: 3 min
 * audio @ 8kHz mono f32 = 5.5 MB peak.
 */
async function readF32Mono(inputPath: string): Promise<Float32Array> {
  return new Promise((resolveRun, rejectRun) => {
    const proc = spawn(
      bin(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-ac',
        '1',
        '-filter:a',
        'aresample=8000',
        '-map',
        '0:a',
        '-f',
        'f32le',
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    const chunks: Buffer[] = []
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    proc.on('error', rejectRun)
    proc.on('close', (code) => {
      if (code !== 0) {
        const tail = stderr.split(/\r?\n/).slice(-8).join('\n')
        rejectRun(new Error(`ffmpeg (peaks) exited ${code}\n${tail}`))
        return
      }
      const buf = Buffer.concat(chunks)
      // Float32Array view onto the Buffer's ArrayBuffer. Slice to the
      // exact byte range so trailing alignment bytes don't sneak in.
      const f32 = new Float32Array(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      )
      resolveRun(f32)
    })
  })
}

/**
 * Bin a signal into N max-peak buckets, normalized to [0, 1].
 *
 * Returns one bucket per `targetSamples` slot:
 *   peaks[i] = max(|samples[start..end]|) where the bucket spans the i-th
 *              equal-length slice of the signal.
 *
 * If the signal is shorter than targetSamples we still emit N buckets,
 * just with smaller (fractional) bucket widths — keeps the output array
 * a stable length so the UI's canvas math doesn't branch on track length.
 *
 * Normalization divides by the global max so the tallest peak is exactly
 * 1.0. A signal of all-zeros returns all zeros (avoids divide-by-zero).
 */
function binMaxPeaks(samples: Float32Array, targetSamples: number): number[] {
  if (targetSamples <= 0) return []
  const out = new Array<number>(targetSamples).fill(0)
  if (samples.length === 0) return out
  const bucketSize = samples.length / targetSamples
  let globalMax = 0
  for (let i = 0; i < targetSamples; i++) {
    const startIdx = Math.floor(i * bucketSize)
    const endIdx = Math.min(samples.length, Math.floor((i + 1) * bucketSize))
    let peak = 0
    for (let j = startIdx; j < endIdx; j++) {
      const v = Math.abs(samples[j]!)
      if (v > peak) peak = v
    }
    out[i] = peak
    if (peak > globalMax) globalMax = peak
  }
  if (globalMax > 0 && globalMax !== 1) {
    const scale = 1 / globalMax
    for (let i = 0; i < targetSamples; i++) out[i]! *= scale
  }
  return out
}

/**
 * Extract peaks from an audio file. Cached by (input absolute path,
 * targetSamples) so re-opening the trimmer in Studio is instant after
 * the first call. The cache key intentionally folds in `targetSamples`
 * so a later resolution bump doesn't return stale low-res data.
 *
 * Order of operations:
 *   1. duration probe (cheap — ffmpeg parses header only)
 *   2. duration guard (reject pathological inputs early)
 *   3. cache check
 *   4. f32 pipe + bin
 *   5. atomic JSON write
 */
export async function extractPeaks(
  inputPath: string,
  opts: ExtractPeaksOptions = {}
): Promise<PeaksResult> {
  const targetSamples = opts.targetSamples ?? DEFAULT_TARGET_SAMPLES
  const maxDuration = opts.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC

  const durationSec = await probeDurationSec(inputPath)
  if (durationSec > maxDuration) {
    throw new Error(
      `peaks: source duration ${durationSec.toFixed(1)}s exceeds limit ${maxDuration}s`
    )
  }

  const key = cacheKey([inputPath, targetSamples, 'v1'])
  const cacheFile = cachePath('peaks', key, 'json')
  if (cacheExists(cacheFile)) {
    const raw = await readFile(cacheFile, 'utf8')
    const parsed = JSON.parse(raw) as PeaksResult
    if (parsed.version === 1 && Array.isArray(parsed.peaks)) {
      return parsed
    }
    // fall through to recompute on schema mismatch
  }

  const samples = await readF32Mono(inputPath)
  const peaks = binMaxPeaks(samples, targetSamples)
  const result: PeaksResult = {
    peaks,
    durationSec,
    sampleCount: peaks.length,
    version: 1,
  }
  await writeAtomic(cacheFile, JSON.stringify(result))
  return result
}

// Internal helper — exported only for unit tests so the binning logic
// can be exercised without spawning ffmpeg.
export const __test = { binMaxPeaks }
