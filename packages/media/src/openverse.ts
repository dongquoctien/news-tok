import { readFile } from 'node:fs/promises'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'
import { downloadToCache } from './download.js'

/**
 * Openverse — the WordPress Foundation's federated CC-licensed media
 * search. Aggregates Wikimedia Commons, Flickr CC, Smithsonian, NASA,
 * Met Museum, museums.victoria, and more. Anonymous requests work
 * (rate-limited by IP); authenticated client_credentials get a higher
 * tier but it isn't required for local rendering.
 *
 * Docs:
 *   https://api.openverse.org/v1/
 *   https://docs.openverse.org/api/guides/quickstart.html
 *   https://docs.openverse.org/api/reference/authentication_and_throttling.html
 *
 * Why this lives alongside Pexels/Unsplash:
 *   - Strictly CC0/CC-BY/CC-BY-SA — every item carries a known license
 *     so commercial use is unambiguous (Pexels/Pixabay licenses are
 *     also commercial-friendly but Openverse exposes the license string
 *     per item, useful for attribution).
 *   - No API key needed, no Cloudflare guard, no JA3 tricks.
 *   - Federates Wikimedia + museums, so coverage is wider than stock
 *     photo libraries for niche / historical topics.
 */

const API_BASE = 'https://api.openverse.org/v1'

export type Orientation = 'landscape' | 'portrait' | 'square'

export type SearchImageOptions = {
  query: string
  orientation?: Orientation
  /**
   * Restrict to a license subset. Default lets through every
   * commercial-friendly license (CC0, BY, BY-SA).
   */
  licenseFilter?: 'commercial' | 'all'
}

type OpenverseImage = {
  id: string
  title?: string
  creator?: string
  creator_url?: string
  url: string // direct image URL
  thumbnail: string
  width?: number
  height?: number
  license: string
  license_version?: string
  attribution?: string
  foreign_landing_url?: string
  source?: string // 'wikimedia', 'flickr', 'smithsonian', ...
}

type OpenverseSearchResponse = {
  result_count: number
  page_count: number
  page_size: number
  page: number
  results: OpenverseImage[]
}

function buildSearchUrl(opts: SearchImageOptions): string {
  const params = new URLSearchParams({
    q: opts.query,
    page_size: '20',
  })
  if (opts.orientation === 'landscape') params.set('aspect_ratio', 'wide')
  else if (opts.orientation === 'portrait') params.set('aspect_ratio', 'tall')
  else if (opts.orientation === 'square') params.set('aspect_ratio', 'square')
  // commercial-friendly licenses by default
  if (opts.licenseFilter !== 'all') {
    params.set('license', 'cc0,by,by-sa')
  }
  return `${API_BASE}/images/?${params.toString()}`
}

function extFromUrl(url: string, fallback = 'jpg'): string {
  const cleaned = url.split('?')[0] ?? url
  const match = /\.([a-zA-Z0-9]{2,5})$/.exec(cleaned)
  return match ? match[1]!.toLowerCase() : fallback
}

async function searchTopResult(opts: SearchImageOptions): Promise<OpenverseImage> {
  const indexPath = cachePath(
    'images',
    cacheKey([
      'openverse',
      'searchImage',
      opts.query,
      opts.orientation ?? 'any',
      opts.licenseFilter ?? 'commercial',
    ]),
    'json'
  )
  if (cacheExists(indexPath)) {
    return JSON.parse(await readFile(indexPath, 'utf8')) as OpenverseImage
  }
  const url = buildSearchUrl(opts)
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      // A self-identifying UA is polite per Openverse docs.
      'User-Agent': 'news-tok/0.1 (+https://github.com/itdongquoctien/news-tok)',
    },
  })
  if (!res.ok) {
    throw new Error(`Openverse search failed (${res.status} ${res.statusText}): ${opts.query}`)
  }
  const json = (await res.json()) as OpenverseSearchResponse
  if (!json.results || json.results.length === 0) {
    throw new Error(`Openverse: no results for "${opts.query}"`)
  }
  // Prefer items that come with usable width/height metadata; fall back
  // to the first result otherwise.
  const top =
    json.results.find((r) => (r.width ?? 0) > 800 && (r.height ?? 0) > 800) ??
    json.results[0]!
  await writeAtomic(indexPath, JSON.stringify(top, null, 2))
  return top
}

export async function searchImage(opts: SearchImageOptions): Promise<AssetRef> {
  const image = await searchTopResult(opts)
  const ext = extFromUrl(image.url, 'jpg')
  const filePath = cachePath('images', cacheKey(['openverse', image.id]), ext)
  await downloadToCache(image.url, filePath, {
    headers: {
      'User-Agent': 'news-tok/0.1 (+https://github.com/itdongquoctien/news-tok)',
    },
  })
  // Compose an attribution string per CC-BY guidance:
  //   "<title> by <creator> (<license> <version>)"
  const attribution = [
    image.title?.trim() || 'Untitled',
    image.creator ? `by ${image.creator}` : null,
    image.license ? `(CC ${image.license.toUpperCase()}${image.license_version ? ' ' + image.license_version : ''})` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return {
    kind: 'image',
    path: filePath,
    source: {
      provider: 'openverse',
      id: image.id,
      url: image.foreign_landing_url ?? image.url,
      attribution,
    },
    width: image.width,
    height: image.height,
  }
}
