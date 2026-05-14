import { readFile } from 'node:fs/promises'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'
import { downloadToCache } from './download.js'

/**
 * Wikimedia Commons — direct MediaWiki API client for image search.
 *
 * Why a dedicated provider when Openverse already federates Commons:
 *   - Openverse re-ranks across Flickr / Smithsonian / museums, so
 *     proper-noun queries (named people, places, events, logos) often
 *     get pushed down by stock-photo-flavoured results.
 *   - Calling Commons directly uses MediaWiki's native fulltext search
 *     (`generator=search`), which is more accurate for entity names in
 *     both EN and VI.
 *   - Same cost tier as Openverse: free, no API key, anonymous OK.
 *
 * Docs:
 *   https://commons.wikimedia.org/w/api.php
 *   https://www.mediawiki.org/wiki/API:Search
 *   https://meta.wikimedia.org/wiki/User-Agent_policy
 *
 * Licensing: Commons mixes Public Domain, CC0, CC-BY, CC-BY-SA; every
 * item is commercial-use-safe. The attribution string built below
 * carries the artist + licence so downstream consumers (caption,
 * description) can credit correctly.
 */

const API_BASE = 'https://commons.wikimedia.org/w/api.php'

// Wikimedia's User-Agent policy requires a self-identifying UA. Bare
// `node-fetch` defaults can be blocked outright.
const USER_AGENT = 'news-tok/0.1 (+https://github.com/itdongquoctien/news-tok)'

const MIN_DIMENSION_PX = 800
const ACCEPTED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

export type Orientation = 'landscape' | 'portrait' | 'square'

export type SearchImageOptions = {
  query: string
  orientation?: Orientation
}

type ImageInfo = {
  url: string
  thumburl?: string
  thumbwidth?: number
  thumbheight?: number
  width: number
  height: number
  size: number
  mime?: string
  descriptionurl?: string
  extmetadata?: Record<string, { value?: string; source?: string }>
}

type SearchPage = {
  pageid: number
  ns: number
  title: string
  index?: number
  imageinfo?: ImageInfo[]
}

type SearchResponse = {
  batchcomplete?: boolean
  query?: { pages?: SearchPage[] }
  error?: { code: string; info: string }
}

function buildSearchUrl(opts: SearchImageOptions): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    // `filetype:bitmap` filters out SVG/PDF/TIFF before the result set is
    // ranked, which keeps the top 10 actionable.
    gsrsearch: `${opts.query} filetype:bitmap`,
    gsrnamespace: '6', // 6 = File namespace
    gsrlimit: '10',
    prop: 'imageinfo|info',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1920',
    format: 'json',
    formatversion: '2',
  })
  return `${API_BASE}?${params.toString()}`
}

function targetRatioFor(orientation: Orientation | undefined): number | null {
  if (orientation === 'landscape') return 16 / 9
  if (orientation === 'portrait') return 9 / 16
  if (orientation === 'square') return 1
  return null
}

/**
 * Score an image: higher = better. Filters out non-bitmap and tiny
 * images first, then scores by closeness to the requested aspect ratio
 * when one is provided. Commons has no native aspect-ratio param.
 */
function scoreImage(
  page: SearchPage,
  targetRatio: number | null
): { page: SearchPage; info: ImageInfo; score: number } | null {
  const info = page.imageinfo?.[0]
  if (!info) return null
  if (info.mime && !ACCEPTED_MIME.has(info.mime.toLowerCase())) return null
  if ((info.width ?? 0) < MIN_DIMENSION_PX) return null
  if ((info.height ?? 0) < MIN_DIMENSION_PX) return null
  const ratio = info.width / info.height
  // Default score is the search-engine rank (lower index = better, so
  // negate). When orientation is requested, replace with aspect-ratio
  // distance (smaller = better, so negate too).
  let score: number
  if (targetRatio !== null) {
    score = -Math.abs(targetRatio - ratio)
  } else {
    score = -(page.index ?? page.pageid)
  }
  return { page, info, score }
}

function extFromMime(mime: string | undefined, fallback = 'jpg'): string {
  if (!mime) return fallback
  const m = mime.toLowerCase()
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/png') return 'png'
  if (m === 'image/webp') return 'webp'
  return fallback
}

function attributionFrom(page: SearchPage, info: ImageInfo): string {
  const meta = info.extmetadata ?? {}
  // Strip the "File:" prefix and the trailing extension off the title.
  const rawTitle = page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')
  const title = (meta.ObjectName?.value || rawTitle).trim()
  const artist = (meta.Artist?.value || '').replace(/<[^>]*>/g, '').trim()
  const licence = (meta.LicenseShortName?.value || meta.UsageTerms?.value || '').trim()
  const parts: string[] = [title || 'Untitled']
  if (artist) parts.push(`by ${artist}`)
  if (licence) {
    parts.push(`(${licence})`)
  } else {
    // No licence string means PD or unknown — say so explicitly rather
    // than silently dropping the marker.
    parts.push('(public domain via Wikimedia Commons)')
  }
  return parts.join(' ')
}

async function fetchTopResult(opts: SearchImageOptions): Promise<{
  page: SearchPage
  info: ImageInfo
}> {
  const indexPath = cachePath(
    'images',
    cacheKey(['wikimedia', 'searchImage', opts.query, opts.orientation ?? 'any']),
    'json'
  )
  if (cacheExists(indexPath)) {
    const cached = JSON.parse(await readFile(indexPath, 'utf8')) as {
      page: SearchPage
      info: ImageInfo
    }
    return cached
  }
  const res = await fetch(buildSearchUrl(opts), {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  })
  if (!res.ok) {
    throw new Error(
      `Wikimedia search failed (${res.status} ${res.statusText}): ${opts.query}`
    )
  }
  const json = (await res.json()) as SearchResponse
  if (json.error) {
    throw new Error(`Wikimedia: ${json.error.code} — ${json.error.info}`)
  }
  const pages = json.query?.pages ?? []
  if (pages.length === 0) {
    throw new Error(`Wikimedia: no results for "${opts.query}"`)
  }
  const targetRatio = targetRatioFor(opts.orientation)
  const ranked = pages
    .map((p) => scoreImage(p, targetRatio))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)
  if (ranked.length === 0) {
    throw new Error(
      `Wikimedia: every result for "${opts.query}" was filtered out (mime / size)`
    )
  }
  const top = ranked[0]!
  await writeAtomic(indexPath, JSON.stringify({ page: top.page, info: top.info }, null, 2))
  return { page: top.page, info: top.info }
}

export async function searchImage(opts: SearchImageOptions): Promise<AssetRef> {
  const { page, info } = await fetchTopResult(opts)
  // Prefer the resized thumb (capped at 1920px wide by iiurlwidth) so
  // we don't pull a 20 MB original when 300 KB is enough.
  const downloadUrl = info.thumburl || info.url
  const ext = extFromMime(info.mime, 'jpg')
  const filePath = cachePath('images', cacheKey(['wikimedia', page.pageid]), ext)
  await downloadToCache(downloadUrl, filePath, {
    headers: { 'User-Agent': USER_AGENT },
  })
  return {
    kind: 'image',
    path: filePath,
    source: {
      provider: 'wikimedia',
      id: String(page.pageid),
      url: info.descriptionurl ?? info.url,
      attribution: attributionFrom(page, info),
    },
    width: info.thumbwidth ?? info.width,
    height: info.thumbheight ?? info.height,
  }
}
