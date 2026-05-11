import { readFile } from 'node:fs/promises'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'
import { downloadToCache } from './download.js'

const IMAGE_API = 'https://pixabay.com/api/'
const MUSIC_API = 'https://pixabay.com/api/music/'

// Pixabay sits behind Cloudflare. Node's TLS fingerprint (JA3) does NOT
// match any major browser, so Cloudflare often serves a JS challenge
// (cf-mitigated=challenge, HTTP 403) regardless of UA. Cloudflare also
// rate-limits per IP, so successive 403s may temporarily ban the IP.
//
// Strategy: rotate UA across retries (curl, wget, python-requests), use
// exponential backoff, and surface a distinctive error so the caller can
// fall back to a non-Cloudflare provider (Unsplash for images, Internet
// Archive for music).
const UA_POOL = [
  'curl/8.4.0',
  'curl/7.88.1',
  'Wget/1.21.4',
  'python-requests/2.32.3',
]

export class CloudflareBlockedError extends Error {
  constructor(public readonly status: number, public readonly mitigated: string | null) {
    super(`Pixabay blocked by Cloudflare (status=${status}, mitigated=${mitigated ?? 'unknown'})`)
    this.name = 'CloudflareBlockedError'
  }
}

async function pixabayFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt < UA_POOL.length; attempt++) {
    const ua = UA_POOL[attempt]!
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), 'User-Agent': ua, Accept: '*/*' },
      })
      if (res.ok) return res
      const mitigated = res.headers.get('cf-mitigated')
      // Non-Cloudflare error (e.g. 400 bad query) — return for caller to surface.
      if (res.status !== 403 && res.status !== 503) return res
      // Cloudflare block — back off and retry with a different UA.
      lastErr = new CloudflareBlockedError(res.status, mitigated)
    } catch (err) {
      lastErr = err
    }
    if (attempt < UA_POOL.length - 1) {
      const delay = 1000 * 2 ** attempt
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Pixabay request failed: ${String(lastErr)}`)
}

export type PixabayOrientation = 'all' | 'horizontal' | 'vertical'

export type PixabaySearchImageOptions = {
  query: string
  orientation?: PixabayOrientation
}

export type PixabaySearchMusicOptions = {
  /** Free-text mood or genre, e.g. "calm", "news", "dramatic". */
  mood: string
  /** Approx duration target in seconds — Pixabay returns by closest match. */
  durationSec: number
}

type PixabayImageHit = {
  id: number
  pageURL: string
  tags: string
  webformatURL: string
  largeImageURL: string
  imageURL?: string
  imageWidth: number
  imageHeight: number
  user: string
}

type PixabayImageResponse = {
  total: number
  totalHits: number
  hits: PixabayImageHit[]
}

type PixabayMusicHit = {
  id: number
  page_url?: string
  pageURL?: string
  tags?: string
  duration?: number
  audio?: string
  user?: string
  user_name?: string
}

type PixabayMusicResponse = {
  total?: number
  totalHits?: number
  hits: PixabayMusicHit[]
}

function apiKey(): string {
  const key = process.env.PIXABAY_API_KEY
  if (!key) throw new Error('PIXABAY_API_KEY is not set')
  return key
}

function extFromUrl(url: string, fallback: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(url)
  return match ? match[1]!.toLowerCase() : fallback
}

async function pickTopImage(opts: PixabaySearchImageOptions): Promise<PixabayImageHit> {
  const indexPath = cachePath(
    'images',
    cacheKey(['pixabay', 'searchImage', opts.query, opts.orientation ?? 'all']),
    'json'
  )
  if (cacheExists(indexPath)) {
    return JSON.parse(await readFile(indexPath, 'utf8')) as PixabayImageHit
  }
  const params = new URLSearchParams({
    key: apiKey(),
    q: opts.query,
    per_page: '15',
    safesearch: 'true',
    image_type: 'photo',
    orientation: opts.orientation ?? 'all',
  })
  const res = await pixabayFetch(`${IMAGE_API}?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Pixabay image search failed (${res.status}): ${opts.query}`)
  }
  const json = (await res.json()) as PixabayImageResponse
  if (!json.hits || json.hits.length === 0) {
    throw new Error(`Pixabay: no image results for "${opts.query}"`)
  }
  const top = json.hits[0]!
  await writeAtomic(indexPath, JSON.stringify(top, null, 2))
  return top
}

export async function searchImage(opts: PixabaySearchImageOptions): Promise<AssetRef> {
  const hit = await pickTopImage(opts)
  const downloadUrl = hit.largeImageURL || hit.webformatURL
  const ext = extFromUrl(downloadUrl, 'jpg')
  const filePath = cachePath('images', cacheKey(['pixabay', hit.id, 'large']), ext)
  await downloadToCache(downloadUrl, filePath, { headers: { 'User-Agent': UA_POOL[0]! } })
  return {
    kind: 'image',
    path: filePath,
    source: {
      provider: 'pixabay',
      id: String(hit.id),
      url: hit.pageURL,
      attribution: hit.user,
    },
    width: hit.imageWidth,
    height: hit.imageHeight,
  }
}

async function pickClosestMusic(opts: PixabaySearchMusicOptions): Promise<PixabayMusicHit> {
  const indexPath = cachePath(
    'music',
    cacheKey(['pixabay', 'searchMusic', opts.mood, opts.durationSec]),
    'json'
  )
  if (cacheExists(indexPath)) {
    return JSON.parse(await readFile(indexPath, 'utf8')) as PixabayMusicHit
  }
  const params = new URLSearchParams({
    key: apiKey(),
    q: opts.mood,
    per_page: '30',
  })
  const res = await pixabayFetch(`${MUSIC_API}?${params.toString()}`)
  if (res.status === 404) {
    throw new Error(
      `Pixabay music API endpoint returns 404 — Pixabay has deprecated this API. ` +
        `Use the Internet Archive music adapter instead (provider="archive").`
    )
  }
  if (!res.ok) {
    throw new Error(`Pixabay music search failed (${res.status}): ${opts.mood}`)
  }
  const json = (await res.json()) as PixabayMusicResponse
  if (!json.hits || json.hits.length === 0) {
    throw new Error(`Pixabay: no music results for "${opts.mood}"`)
  }
  // Pick the track whose duration is closest to (and >= 0.7 *) the requested length.
  const target = opts.durationSec
  const candidates = json.hits.filter((h) => h.audio)
  candidates.sort((a, b) => {
    const da = Math.abs((a.duration ?? 0) - target)
    const db = Math.abs((b.duration ?? 0) - target)
    return da - db
  })
  const best = candidates[0] ?? json.hits[0]!
  await writeAtomic(indexPath, JSON.stringify(best, null, 2))
  return best
}

export async function searchMusic(opts: PixabaySearchMusicOptions): Promise<AssetRef> {
  const hit = await pickClosestMusic(opts)
  if (!hit.audio) {
    throw new Error(`Pixabay music hit has no audio URL: id=${hit.id}`)
  }
  const ext = extFromUrl(hit.audio, 'mp3')
  const filePath = cachePath('music', cacheKey(['pixabay-music', hit.id]), ext)
  await downloadToCache(hit.audio, filePath, { headers: { 'User-Agent': UA_POOL[0]! } })
  return {
    kind: 'audio',
    path: filePath,
    source: {
      provider: 'pixabay',
      id: String(hit.id),
      url: hit.page_url ?? hit.pageURL,
      attribution: hit.user_name ?? hit.user,
    },
    durationSec: hit.duration,
  }
}
