import { readFile } from 'node:fs/promises'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'
import { downloadToCache } from './download.js'

const API_BASE = 'https://api.unsplash.com'

export type UnsplashOrientation = 'landscape' | 'portrait' | 'squarish'

export type UnsplashSearchImageOptions = {
  query: string
  orientation?: 'landscape' | 'portrait' | 'square'
}

type UnsplashPhoto = {
  id: string
  width: number
  height: number
  urls: {
    raw: string
    full: string
    regular: string
    small: string
    thumb: string
  }
  links: {
    html: string
    download_location: string
  }
  user: {
    name: string
    username: string
    links: { html: string }
  }
}

type UnsplashSearchResponse = {
  total: number
  total_pages: number
  results: UnsplashPhoto[]
}

function accessKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) throw new Error('UNSPLASH_ACCESS_KEY is not set')
  return key
}

function mapOrientation(o?: UnsplashSearchImageOptions['orientation']): UnsplashOrientation | undefined {
  if (o === 'square') return 'squarish'
  return o
}

function extFromUrl(url: string, fallback: string): string {
  // Unsplash CDN URLs put the format in a `fm=jpg|webp` query param. Default jpg.
  const u = new URL(url)
  const fm = u.searchParams.get('fm')
  if (fm) return fm.toLowerCase()
  const m = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(u.pathname)
  return m ? m[1]!.toLowerCase() : fallback
}

async function pickTopResult(opts: UnsplashSearchImageOptions): Promise<UnsplashPhoto> {
  const indexPath = cachePath(
    'images',
    cacheKey(['unsplash', 'searchImage', opts.query, opts.orientation ?? 'any']),
    'json'
  )
  if (cacheExists(indexPath)) {
    return JSON.parse(await readFile(indexPath, 'utf8')) as UnsplashPhoto
  }
  const params = new URLSearchParams({
    query: opts.query,
    per_page: '15',
    content_filter: 'high',
  })
  const orientation = mapOrientation(opts.orientation)
  if (orientation) params.set('orientation', orientation)

  const res = await fetch(`${API_BASE}/search/photos?${params}`, {
    headers: {
      Authorization: `Client-ID ${accessKey()}`,
      'Accept-Version': 'v1',
    },
  })
  if (!res.ok) {
    throw new Error(`Unsplash search failed (${res.status} ${res.statusText}): ${opts.query}`)
  }
  const json = (await res.json()) as UnsplashSearchResponse
  if (!json.results || json.results.length === 0) {
    throw new Error(`Unsplash: no results for "${opts.query}"`)
  }
  const top = json.results[0]!
  await writeAtomic(indexPath, JSON.stringify(top, null, 2))
  return top
}

/**
 * Hit Unsplash's download tracking endpoint per their API Guidelines.
 * Fire-and-forget — failures here are non-fatal for the caller.
 */
async function trackDownload(downloadLocation: string): Promise<void> {
  try {
    await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${accessKey()}` },
    })
  } catch {
    // Ignore — tracking is best-effort.
  }
}

export async function searchImage(opts: UnsplashSearchImageOptions): Promise<AssetRef> {
  const photo = await pickTopResult(opts)
  const downloadUrl = photo.urls.regular
  const ext = extFromUrl(downloadUrl, 'jpg')
  const filePath = cachePath('images', cacheKey(['unsplash', photo.id, 'regular']), ext)
  const wasCached = cacheExists(filePath)
  await downloadToCache(downloadUrl, filePath)
  if (!wasCached) {
    void trackDownload(photo.links.download_location)
  }
  return {
    kind: 'image',
    path: filePath,
    source: {
      provider: 'unsplash',
      id: photo.id,
      url: photo.links.html,
      attribution: photo.user.name,
    },
    width: photo.width,
    height: photo.height,
  }
}
