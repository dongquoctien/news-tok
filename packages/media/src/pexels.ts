import { readFile } from 'node:fs/promises'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'
import { downloadToCache } from './download.js'

const API_BASE = 'https://api.pexels.com/v1'

export type Orientation = 'landscape' | 'portrait' | 'square'

export type SearchImageOptions = {
  query: string
  orientation?: Orientation
  /** "small" | "medium" | "large" | "large2x" | "original" — default "large". */
  size?: 'small' | 'medium' | 'large' | 'large2x' | 'original'
}

type PexelsPhotoSrc = {
  original: string
  large2x: string
  large: string
  medium: string
  small: string
  portrait: string
  landscape: string
  tiny: string
}

type PexelsPhoto = {
  id: number
  width: number
  height: number
  url: string
  photographer: string
  photographer_url: string
  src: PexelsPhotoSrc
  alt: string
}

type PexelsSearchResponse = {
  photos: PexelsPhoto[]
  total_results: number
  next_page?: string
}

function apiKey(): string {
  const key = process.env.PEXELS_API_KEY
  if (!key) throw new Error('PEXELS_API_KEY is not set')
  return key
}

function pickSize(src: PexelsPhotoSrc, size: SearchImageOptions['size']): string {
  switch (size) {
    case 'small':
      return src.small
    case 'medium':
      return src.medium
    case 'large2x':
      return src.large2x
    case 'original':
      return src.original
    case 'large':
    default:
      return src.large
  }
}

function extFromUrl(url: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(url)
  return match ? match[1]!.toLowerCase() : 'jpg'
}

async function searchTopResult(query: string, orientation?: Orientation): Promise<PexelsPhoto> {
  const indexPath = cachePath(
    'images',
    cacheKey(['pexels', 'searchImage', query, orientation ?? 'any']),
    'json'
  )
  if (cacheExists(indexPath)) {
    return JSON.parse(await readFile(indexPath, 'utf8')) as PexelsPhoto
  }
  const params = new URLSearchParams({ query, per_page: '15' })
  if (orientation) params.set('orientation', orientation)
  const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
    headers: { Authorization: apiKey() },
  })
  if (!res.ok) {
    throw new Error(`Pexels search failed (${res.status} ${res.statusText}): ${query}`)
  }
  const json = (await res.json()) as PexelsSearchResponse
  if (!json.photos || json.photos.length === 0) {
    throw new Error(`Pexels: no results for "${query}"`)
  }
  const top = json.photos[0]!
  await writeAtomic(indexPath, JSON.stringify(top, null, 2))
  return top
}

export async function searchImage(opts: SearchImageOptions): Promise<AssetRef> {
  const photo = await searchTopResult(opts.query, opts.orientation)
  const downloadUrl = pickSize(photo.src, opts.size)
  const ext = extFromUrl(downloadUrl)
  const filePath = cachePath('images', cacheKey(['pexels', photo.id, opts.size ?? 'large']), ext)
  await downloadToCache(downloadUrl, filePath)
  return {
    kind: 'image',
    path: filePath,
    source: {
      provider: 'pexels',
      id: String(photo.id),
      url: photo.url,
      attribution: photo.photographer,
    },
    width: photo.width,
    height: photo.height,
  }
}
