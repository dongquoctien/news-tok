import { readFile } from 'node:fs/promises'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { stripEmoji } from '@news-tok/shared/sanitize'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'
import { downloadToCache } from './download.js'

/**
 * Hard floor on article body length before we trigger the stealth browser
 * fallback. Set to a value that comfortably clears every CAPTCHA / anti-bot
 * boilerplate page we've seen in production (nld.com.vn returns ~140 chars,
 * Cloudflare interstitial ~100, soha.vn limit page ~250) but still sits
 * under the shortest legitimate news flash we've measured (~700 chars on
 * "tin nhanh" stubs that have actual body content). 400 keeps the
 * fallback off real articles while still catching every interstitial.
 */
const MIN_ARTICLE_TEXT_CHARS = 400

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

/**
 * Run Readability on a raw HTML string. Returns null when Readability
 * can't find an article body (e.g. the page is a CAPTCHA wall). Kept
 * as a small helper so `extractArticle` can call it twice — once on
 * the plain-fetch HTML, then again on the stealth-browser HTML if the
 * first pass came back too short.
 *
 * Narrows `parsed` to non-null in the return type so downstream code
 * doesn't have to re-prove the guard for every field access.
 */
type ParsedArticle = NonNullable<ReturnType<Readability['parse']>>
function parseWithReadability(
  html: string,
  url: string
): { parsed: ParsedArticle; media: ExtractedMedia[] } | null {
  const dom = new JSDOM(html, { url })
  // Extract media BEFORE Readability — Readability strips most of the
  // DOM, including `<meta>` tags, so we have to capture them off the
  // raw document first.
  const media = extractMedia(dom.window.document, url)
  const reader = new Readability(dom.window.document)
  const parsed = reader.parse()
  if (!parsed || !parsed.textContent) return null
  return { parsed, media }
}

/**
 * Stealth-browser fallback. News sites (nld.com.vn, soha.vn, some
 * Cloudflare-fronted regional publishers) increasingly serve a
 * CAPTCHA / anti-DDoS interstitial to plain Node `fetch` while
 * letting real Chromium through. The crawler package already runs a
 * stealthy Chromium for image / music scraping, so we reuse its
 * `withPage` helper here. Dynamic import keeps Playwright off the
 * load path for callers that never need the fallback (Tests, the
 * MCP server build, and the happy-path Readability parse all
 * remain Playwright-free).
 *
 * Returns the page HTML, or null when Chromium can't reach the URL
 * (network, timeout, browser launch failure). Null lets the caller
 * surface a clean error rather than crash the whole pipeline.
 */
async function fetchWithStealthBrowser(url: string): Promise<string | null> {
  try {
    const { withPage } = await import('./crawler/browser.js')
    return await withPage(async (page) => {
      // domcontentloaded is enough — Readability doesn't need the JS
      // shim layer to have hydrated, and 'load' adds 5-10s on news
      // sites with lazy ad iframes. Cap at 30s so the orchestrator
      // doesn't sit forever on a wedged page.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      return await page.content()
    })
  } catch {
    return null
  }
}

export async function extractArticle(
  url: string,
  options: ExtractOptions = {}
): Promise<ExtractedArticle> {
  // Cache key bumped to v3 so previously-cached CAPTCHA / anti-bot
  // bodies (from before the stealth-browser fallback shipped) get a
  // chance to re-fetch through the real Chromium path. Older v2-media
  // entries on disk simply become orphan cache files; they cost a few
  // KB but don't affect correctness.
  const key = cacheKey(['readability', 'v3-pw-fallback', url])
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

  let extracted = parseWithReadability(html, url)
  let usedFallback = false

  // CAPTCHA / anti-bot pages typically parse fine through Readability
  // but yield ~50-250 chars of "Please complete this challenge" text.
  // Re-run through the stealth browser when the body is suspiciously
  // short OR when Readability bailed entirely. Skip the fallback when
  // the caller already asked us to skip media downloads AND the text
  // we got is plausible — caption-only flows don't need a slow
  // browser launch just to fluff out the body.
  const tooShort =
    !extracted || extracted.parsed.textContent.trim().length < MIN_ARTICLE_TEXT_CHARS
  if (tooShort) {
    const fallbackHtml = await fetchWithStealthBrowser(url)
    if (fallbackHtml) {
      const retry = parseWithReadability(fallbackHtml, url)
      // Only adopt the fallback when it actually beats the first pass.
      // Some sites serve the same body to fetch and to Chromium — in
      // that case we keep whatever the first pass produced rather than
      // pay the browser cost for the same answer.
      if (
        retry &&
        retry.parsed.textContent.trim().length >
          (extracted?.parsed.textContent.trim().length ?? 0)
      ) {
        extracted = retry
        usedFallback = true
      }
    }
  }

  if (!extracted) {
    throw new Error(`Readability could not extract content from ${url}`)
  }

  const { parsed, media } = extracted

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

  // Final guard — if even the stealth fallback couldn't get a usable
  // body, refuse to cache + return so the orchestrator surfaces the
  // failure cleanly instead of treating an empty article as success.
  if (result.text.length < MIN_ARTICLE_TEXT_CHARS) {
    throw new Error(
      `Article body too short (${result.text.length} chars) after ${usedFallback ? 'stealth-browser fallback' : 'plain fetch'} — likely a CAPTCHA / anti-bot interstitial. Try pasting the article text directly instead of the URL.`
    )
  }

  await writeAtomic(path, JSON.stringify(result, null, 2))
  return result
}
