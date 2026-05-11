import { readFile } from 'node:fs/promises'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { stripEmoji } from '@news-tok/shared/sanitize'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'

export type ExtractedArticle = {
  url: string
  title: string
  text: string
  byline: string | null
  excerpt: string | null
  siteName: string | null
  lang: string | null
}

export type ExtractOptions = {
  /** Bypass cache and re-fetch. */
  force?: boolean
  /** Override User-Agent for the fetch. */
  userAgent?: string
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function extractArticle(
  url: string,
  options: ExtractOptions = {}
): Promise<ExtractedArticle> {
  const key = cacheKey(['readability', url])
  const path = cachePath('articles', key, 'json')

  if (!options.force && cacheExists(path)) {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as ExtractedArticle
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': options.userAgent ?? DEFAULT_UA },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`)
  }
  const html = await res.text()

  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const parsed = reader.parse()
  if (!parsed || !parsed.textContent) {
    throw new Error(`Readability could not extract content from ${url}`)
  }

  const result: ExtractedArticle = {
    url,
    title: stripEmoji(parsed.title ?? ''),
    text: stripEmoji(parsed.textContent.trim()),
    byline: parsed.byline ? stripEmoji(parsed.byline) : null,
    excerpt: parsed.excerpt ? stripEmoji(parsed.excerpt) : null,
    siteName: parsed.siteName ?? null,
    lang: parsed.lang ?? null,
  }

  await writeAtomic(path, JSON.stringify(result, null, 2))
  return result
}
