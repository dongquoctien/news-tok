import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve as resolvePath } from 'node:path'
import { MsEdgeTTS, OUTPUT_FORMAT, type Voice } from 'msedge-tts'
import type { AssetRef, Language } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'

export type WordBoundary = {
  /** Offset in seconds from start of audio. */
  offsetSec: number
  /** Duration of the word in seconds. */
  durationSec: number
  /** The literal text segment for this boundary. */
  text: string
}

export type SynthesizeOptions = {
  text: string
  voiceId: string
  /** Speech rate, 0.5–2 (default 1). Implemented as SSML "rate" percentage. */
  speed?: number
}

export type SynthesizeResult = {
  asset: AssetRef
  /** Approximate total duration of the audio in seconds (from last word boundary). */
  durationSec: number
  wordBoundaries: WordBoundary[]
}

type EdgeMetadataFile = {
  Metadata?: Array<{
    Type?: string
    Data?: {
      Offset?: number
      Duration?: number
      text?: { Text?: string; Length?: number; BoundaryType?: string }
    }
  }>
}

function rateString(speed: number | undefined): string | undefined {
  if (speed == null || speed === 1) return undefined
  const pct = Math.round((speed - 1) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

/**
 * Escape characters that would otherwise break the SSML payload Edge TTS
 * sends to its backend. msedge-tts wraps the input into an XML template
 * (`<speak>...</speak>`) without escaping, so any of `& < > " '` from
 * the article body can produce a malformed request that closes the
 * WebSocket with no useful error. Also normalises smart quotes to plain
 * ASCII so the SSML stays well-formed.
 */
function sanitizeSsmlText(text: string): string {
  return text
    // Smart quotes → ASCII to avoid SSML/XML encoding surprises.
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    // XML entity escapes — ampersand first so we don't double-escape.
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function parseWordBoundaries(meta: EdgeMetadataFile): WordBoundary[] {
  const out: WordBoundary[] = []
  for (const m of meta.Metadata ?? []) {
    if (m.Type !== 'WordBoundary' || !m.Data) continue
    out.push({
      offsetSec: (m.Data.Offset ?? 0) / 1e7,
      durationSec: (m.Data.Duration ?? 0) / 1e7,
      text: m.Data.text?.Text ?? '',
    })
  }
  return out
}

let cachedVoices: Voice[] | null = null

export async function listVoices(language?: Language): Promise<Voice[]> {
  if (!cachedVoices) {
    const tts = new MsEdgeTTS()
    cachedVoices = await tts.getVoices()
  }
  if (!language) return cachedVoices
  const localePrefix = language === 'vi' ? 'vi-VN' : 'en-US'
  return cachedVoices.filter((v) => v.Locale.startsWith(localePrefix))
}

export async function synthesize(opts: SynthesizeOptions): Promise<SynthesizeResult> {
  const key = cacheKey(['edge-tts', opts.voiceId, opts.speed ?? 1, opts.text])
  const mp3Path = cachePath('tts', key, 'mp3')
  const wbPath = cachePath('tts', key, 'words.json')

  if (cacheExists(mp3Path) && cacheExists(wbPath)) {
    const wb = JSON.parse(await readFile(wbPath, 'utf8')) as WordBoundary[]
    const last = wb[wb.length - 1]
    const durationSec = last ? last.offsetSec + last.durationSec : 0
    return {
      asset: buildAsset(mp3Path, opts.voiceId, durationSec),
      durationSec,
      wordBoundaries: wb,
    }
  }

  await mkdir(resolvePath(mp3Path, '..'), { recursive: true })

  const rate = rateString(opts.speed)
  const safeText = sanitizeSsmlText(opts.text)
  const tmpDir = await mkdtemp(resolvePath(tmpdir(), 'news-tok-tts-'))
  try {
    let audioFilePath: string
    let wb: WordBoundary[] = []

    // First try with word boundaries enabled. Edge TTS occasionally returns
    // audio but no metadata for very short utterances; msedge-tts then throws
    // "No metadata received". Retry without boundaries so synthesis at least
    // succeeds.
    try {
      const out = await callWithRetry(opts.voiceId, safeText, rate, tmpDir, true)
      audioFilePath = out.audioFilePath
      if (out.metadataFilePath) {
        const meta = JSON.parse(await readFile(out.metadataFilePath, 'utf8')) as EdgeMetadataFile
        wb = parseWordBoundaries(meta)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/no metadata/i.test(message)) throw err
      const out = await callWithRetry(opts.voiceId, safeText, rate, tmpDir, false)
      audioFilePath = out.audioFilePath
    }

    await copyFile(audioFilePath, mp3Path)
    await writeAtomic(wbPath, JSON.stringify(wb, null, 2))

    const last = wb[wb.length - 1]
    const durationSec = last ? last.offsetSec + last.durationSec : 0
    return {
      asset: buildAsset(mp3Path, opts.voiceId, durationSec),
      durationSec,
      wordBoundaries: wb,
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

async function runToFile(
  voiceId: string,
  text: string,
  rate: string | undefined,
  tmpDir: string,
  wordBoundaryEnabled: boolean
): Promise<{ audioFilePath: string; metadataFilePath: string | null }> {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    wordBoundaryEnabled,
  })
  try {
    return await tts.toFile(tmpDir, text, rate ? { rate } : undefined)
  } finally {
    try {
      tts.close()
    } catch {
      // tts.close() can throw if the socket already closed underneath us;
      // swallow so the synth path keeps owning the user-visible error.
    }
  }
}

const TRANSIENT_PATTERNS = [
  /websocket/i,
  /econnreset/i,
  /etimedout/i,
  /socket hang up/i,
  /connection closed/i,
  /no audio data/i,
]

/**
 * Wrap runToFile with a single retry on transient WebSocket errors.
 * Edge TTS occasionally closes the socket mid-handshake; a fresh attempt
 * almost always succeeds. Non-transient failures (auth, malformed SSML,
 * "No metadata received") bubble immediately so the caller can fall back
 * to the no-boundary path.
 */
async function callWithRetry(
  voiceId: string,
  text: string,
  rate: string | undefined,
  tmpDir: string,
  wordBoundaryEnabled: boolean
): Promise<{ audioFilePath: string; metadataFilePath: string | null }> {
  try {
    return await runToFile(voiceId, text, rate, tmpDir, wordBoundaryEnabled)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!TRANSIENT_PATTERNS.some((re) => re.test(message))) throw err
    // Brief backoff so we don't slam the endpoint when it's already
    // closing connections.
    await new Promise((r) => setTimeout(r, 400))
    return runToFile(voiceId, text, rate, tmpDir, wordBoundaryEnabled)
  }
}

function buildAsset(path: string, voiceId: string, durationSec: number): AssetRef {
  return {
    kind: 'audio',
    path,
    source: {
      provider: 'edge-tts',
      id: voiceId,
    },
    durationSec,
  }
}
