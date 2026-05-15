import { readFile } from 'node:fs/promises'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { stripEmoji } from '@news-tok/shared/sanitize'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'
import { downloadToCache } from './download.js'

export type ExtractedMedia = {
  kind: 'image' | 'video'
  url: string
  /** Fig-caption / `<picture>` <figcaption> text or img.alt. */
  caption?: string
  alt?: string
  width?: number
  height?: number
  /** Where in the DOM we found it: helps callers prioritise. */
  source: 'og' | 'figure' | 'inline'
}

export type ExtractedArticle = {
  url: string
  title: string
  text: string
  byline: string | null
  excerpt: string | null
  siteName: string | null
  lang: string | null
  /**
   * Image / video references discovered in the article HTML. Always
   * present (may be empty); pre-existing callers ignored this field
   * when older caches lacked it. Image entries that auto-downloaded
   * successfully get a matching entry in `mediaAssets`.
   */
  media: ExtractedMedia[]
  /**
   * AssetRef[] for media that was successfully downloaded into the
   * cache. The orchestrator can use these directly as
   * segment.visuals.background or surface them through the project
   * Library so users see the original article media alongside any
   * stock photos picked by `searchImage`.
   */
  mediaAssets: AssetRef[]
}

export type ExtractOptions = {
  /** Bypass cache and re-fetch. */
  force?: boolean
  /** Override User-Agent for the fetch. */
  userAgent?: string
  /**
   * Skip auto-downloading article media files. Default false. When the
   * caller only needs text (e.g. captioning), pass true to avoid
   * spending bandwidth on images that won't be used.
   */
  skipMediaDownload?: boolean
  /** Cap on number of media files downloaded per article. Default 12. */
  maxMediaDownloads?: number
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Pull every plausible image off the article DOM. We look in three
 * places, in priority order:
 *   1. og:image / twitter:image meta tags — usually the curated hero shot
 *   2. <figure><img> inside the article body — usually editorial photos
 *   3. plain inline <img> — last resort, includes ad slots etc.
 *
 * Returns a deduped list. Callers downstream can filter further (e.g.
 * by min width) if they want to skip 1x1 trackers or icon sprites.
 */
function extractMedia(doc: Document, baseUrl: string): ExtractedMedia[] {
  const seen = new Set<string>()
  const out: ExtractedMedia[] = []

  const push = (m: ExtractedMedia) => {
    // Resolve relative URLs against the article URL once, then dedupe.
    let resolved: string
    try {
      resolved = new URL(m.url, baseUrl).toString()
    } catch {
      return
    }
    if (seen.has(resolved)) return
    seen.add(resolved)
    out.push({ ...m, url: resolved })
  }

  // 1. og:image / twitter:image — these meta tags are the article's
  //    own choice of hero, so they belong at the top of the list.
  const metaImages = doc.querySelectorAll(
    'meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"], meta[property="twitter:image"]'
  )
  metaImages.forEach((el) => {
    const content = el.getAttribute('content')
    if (!content) return
    push({ kind: 'image', url: content, source: 'og' })
  })

  // og:video — sometimes used for embedded news clips. We collect the
  // URL but never auto-download (videos can be hundreds of MB).
  const metaVideos = doc.querySelectorAll(
    'meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]'
  )
  metaVideos.forEach((el) => {
    const content = el.getAttribute('content')
    if (!content) return
    push({ kind: 'video', url: content, source: 'og' })
  })

  // 2. <figure> inside the parsed article body — editorial photos with
  //    captions. We grab the inner img + the figcaption text.
  const figures = doc.querySelectorAll('figure')
  figures.forEach((fig) => {
    const img = fig.querySelector('img')
    if (!img) return
    const src = img.getAttribute('src') || img.getAttribute('data-src')
    if (!src) return
    const caption = fig.querySelector('figcaption')?.textContent?.trim() || undefined
    push({
      kind: 'image',
      url: src,
      caption: caption ? stripEmoji(caption) : undefined,
      alt: img.getAttribute('alt') || undefined,
      width: parseIntOrUndef(img.getAttribute('width')),
      height: parseIntOrUndef(img.getAttribute('height')),
      source: 'figure',
    })
  })

  // 3. Plain inline <img>. We skip data: URIs (usually inline SVG/icons)
  //    and very small images (likely tracking pixels or sprites).
  const inlineImgs = doc.querySelectorAll('img')
  inlineImgs.forEach((img) => {
    const src = img.getAttribute('src') || img.getAttribute('data-src')
    if (!src || src.startsWith('data:')) return
    const w = parseIntOrUndef(img.getAttribute('width'))
    const h = parseIntOrUndef(img.getAttribute('height'))
    // Tracker pixels and tiny icons rarely contribute. 80px on either
    // axis is the common cutoff used by other readers.
    if ((w && w < 80) || (h && h < 80)) return
    push({
      kind: 'image',
      url: src,
      alt: img.getAttribute('alt') || undefined,
      width: w,
      height: h,
      source: 'inline',
    })
  })

  return out
}

function parseIntOrUndef(s: string | null | undefined): number | undefined {
  if (!s) return undefined
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Heuristic — guess a file extension from a URL or content-type.
 * Article images often carry no extension (e.g. CDN URLs ending in
 * `?w=1080`); we fall back to `.jpg` because that's overwhelmingly
 * what news sites serve.
 */
function guessImageExt(url: string, contentType?: string | null): string {
  if (contentType) {
    if (contentType.includes('webp')) return 'webp'
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('gif')) return 'gif'
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  }
  const m = url.match(/\.(jpe?g|png|webp|gif)(?:\?|#|$)/i)
  if (m) return m[1]!.toLowerCase().replace('jpeg', 'jpg')
  return 'jpg'
}

/**
 * Download an image and return an AssetRef. Failures are non-fatal;
 * the caller filters out null results so one bad URL doesn't kill the
 * whole batch. We probe the response Content-Type to pick the right
 * extension because article CDNs often strip the file suffix.
 */
async function tryDownloadImage(
  url: string,
  userAgent: string
): Promise<AssetRef | null> {
  try {
    // HEAD first to learn content type without fetching the bytes.
    let contentType: string | null = null
    try {
      const head = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': userAgent },
        redirect: 'follow',
      })
      if (head.ok) contentType = head.headers.get('content-type')
    } catch {
      /* fall through — some CDNs reject HEAD; we'll get the type from GET */
    }
    const ext = guessImageExt(url, contentType)
    const key = cacheKey(['article-image', url])
    const path = cachePath('images', key, ext)
    await downloadToCache(url, path, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
    })
    return {
      kind: 'image',
      path,
      source: { provider: 'crawl', id: url, url, attribution: url },
    }
  } catch {
    return null
  }
}

export async function extractArticle(
  url: string,
  options: ExtractOptions = {}
): Promise<ExtractedArticle> {
  const key = cacheKey(['readability', 'v2-media', url])
  const path = cachePath('articles', key, 'json')

  if (!options.force && cacheExists(path)) {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as ExtractedArticle
  }

  const ua = options.userAgent ?? DEFAULT_UA
  const res = await fetch(url, {
    headers: { 'User-Agent': ua },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`)
  }
  const html = await res.text()

  const dom = new JSDOM(html, { url })
  // Extract media BEFORE Readability — Readability strips most of the
  // DOM, including `<meta>` tags, so we have to capture them off the
  // raw document first.
  const media = extractMedia(dom.window.document, url)

  const reader = new Readability(dom.window.document)
  const parsed = reader.parse()
  if (!parsed || !parsed.textContent) {
    throw new Error(`Readability could not extract content from ${url}`)
  }

  // Auto-download images (skip videos; they can be huge). Failed
  // downloads are silently dropped — the metadata still lives in
  // `media` so the orchestrator can retry or surface to the user.
  let mediaAssets: AssetRef[] = []
  if (!options.skipMediaDownload) {
    const cap = options.maxMediaDownloads ?? 12
    const images = media.filter((m) => m.kind === 'image').slice(0, cap)
    const results = await Promise.all(images.map((m) => tryDownloadImage(m.url, ua)))
    mediaAssets = results.filter((a): a is AssetRef => a !== null)
  }

  const result: ExtractedArticle = {
    url,
    title: stripEmoji(parsed.title ?? ''),
    text: stripEmoji(parsed.textContent.trim()),
    byline: parsed.byline ? stripEmoji(parsed.byline) : null,
    excerpt: parsed.excerpt ? stripEmoji(parsed.excerpt) : null,
    siteName: parsed.siteName ?? null,
    lang: parsed.lang ?? null,
    media,
    mediaAssets,
  }

  await writeAtomic(path, JSON.stringify(result, null, 2))
  return result
}
