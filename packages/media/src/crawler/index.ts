import { readFile } from 'node:fs/promises'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from '../cache.js'
import { crawlDownload, crawlSearch } from './crawl.js'
import { loadProvider } from './registry.js'
import type { CrawlItem, SearchParams } from './providers/types.js'

export { closeBrowser } from './browser.js'
export { listProviders, loadProvider } from './registry.js'
export type { ProviderConfig } from './providers/types.js'

type ProviderTag = AssetRef['source']['provider']

/** Map a crawl provider config name to the AssetRef.source.provider enum. */
function tagFor(providerName: string): ProviderTag {
  if (providerName.startsWith('pixabay')) return 'pixabay'
  if (providerName.startsWith('unsplash')) return 'unsplash'
  if (providerName.startsWith('pexels')) return 'pexels'
  if (providerName.startsWith('jamendo')) return 'jamendo'
  if (providerName.startsWith('freesound')) return 'freesound'
  return 'crawl'
}

function parseDuration(s: string | undefined): number | undefined {
  if (!s) return undefined
  if (/^\d+(\.\d+)?$/.test(s)) return Number.parseFloat(s)
  const m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s)
  if (!m) return undefined
  if (m[3]) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  return Number(m[1]) * 60 + Number(m[2])
}

function extFromUrl(url: string, fallback: string): string {
  const u = url.split('?')[0]!
  const m = /\.([a-zA-Z0-9]{2,5})$/.exec(u)
  return m ? m[1]!.toLowerCase() : fallback
}

function pickByDuration(items: CrawlItem[], target: number): CrawlItem | null {
  if (items.length === 0) return null
  const scored = items
    .map((it) => ({ it, dur: parseDuration(it.duration) }))
    .filter((x) => x.dur != null) as Array<{ it: CrawlItem; dur: number }>
  if (scored.length === 0) return items[0] ?? null
  scored.sort((a, b) => Math.abs(a.dur - target) - Math.abs(b.dur - target))
  return scored[0]?.it ?? null
}

type CrawlSearchOptions = {
  /** Provider config name (e.g. "pixabay-image"). */
  provider: string
  params: SearchParams
}

async function readJsonCache<T>(path: string): Promise<T | null> {
  if (!cacheExists(path)) return null
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export async function crawlImage(opts: CrawlSearchOptions): Promise<AssetRef> {
  const config = await loadProvider(opts.provider)
  if (config.kind !== 'image') {
    throw new Error(`Provider ${opts.provider} is kind=${config.kind}, not image`)
  }

  const indexPath = cachePath(
    'images',
    cacheKey(['crawl', opts.provider, opts.params.query, opts.params.orientation ?? 'any']),
    'json'
  )

  const cached = await readJsonCache<CrawlItem>(indexPath)
  let chosen: CrawlItem
  if (cached) {
    chosen = cached
  } else {
    const { items } = await crawlSearch(config, opts.params)
    const first = items.find((it) => it.downloadUrl)
    if (!first) throw new Error(`crawlImage(${opts.provider}): no item with downloadUrl`)
    chosen = first
    await writeAtomic(indexPath, JSON.stringify(chosen, null, 2))
  }

  const ext = extFromUrl(chosen.downloadUrl!, 'jpg')
  const filePath = cachePath('images', cacheKey(['crawl', opts.provider, chosen.downloadUrl!]), ext)
  if (!cacheExists(filePath)) {
    const buf = await crawlDownload(chosen.downloadUrl!)
    await writeAtomic(filePath, buf)
  }

  return {
    kind: 'image',
    path: filePath,
    source: {
      provider: tagFor(opts.provider),
      id: chosen.trackId ?? chosen.soundId ?? undefined,
      url: chosen.pageUrl ?? undefined,
      attribution: chosen.author ?? chosen.alt ?? undefined,
    },
  }
}

type CrawlMusicOptions = CrawlSearchOptions & { durationSec: number }

export async function crawlMusic(opts: CrawlMusicOptions): Promise<AssetRef> {
  const config = await loadProvider(opts.provider)
  if (config.kind !== 'music' && config.kind !== 'sfx') {
    throw new Error(`Provider ${opts.provider} is kind=${config.kind}, not music/sfx`)
  }

  const indexPath = cachePath(
    'music',
    cacheKey(['crawl', opts.provider, opts.params.query, opts.durationSec]),
    'json'
  )

  const cached = await readJsonCache<CrawlItem>(indexPath)
  let chosen: CrawlItem
  if (cached) {
    chosen = cached
  } else {
    const { items } = await crawlSearch(config, { ...opts.params, durationSec: opts.durationSec })
    const filtered = items.filter((it) => it.downloadUrl)
    const picked = pickByDuration(filtered, opts.durationSec) ?? filtered[0]
    if (!picked) throw new Error(`crawlMusic(${opts.provider}): no track with downloadUrl`)
    chosen = picked
    await writeAtomic(indexPath, JSON.stringify(chosen, null, 2))
  }

  const ext = extFromUrl(chosen.downloadUrl!, 'mp3')
  const filePath = cachePath('music', cacheKey(['crawl', opts.provider, chosen.downloadUrl!]), ext)
  if (!cacheExists(filePath)) {
    const buf = await crawlDownload(chosen.downloadUrl!)
    await writeAtomic(filePath, buf)
  }

  const dur = parseDuration(chosen.duration)
  return {
    kind: 'audio',
    path: filePath,
    source: {
      provider: tagFor(opts.provider),
      id: chosen.trackId ?? chosen.soundId ?? undefined,
      url: chosen.pageUrl ?? undefined,
      attribution: chosen.artist ?? chosen.author ?? chosen.title ?? undefined,
    },
    durationSec: dur,
  }
}

export async function crawlVideo(opts: CrawlSearchOptions): Promise<AssetRef> {
  const config = await loadProvider(opts.provider)
  if (config.kind !== 'video') {
    throw new Error(`Provider ${opts.provider} is kind=${config.kind}, not video`)
  }

  const indexPath = cachePath(
    'videos',
    cacheKey(['crawl-video', opts.provider, opts.params.query, opts.params.orientation ?? 'any']),
    'json'
  )

  const cached = await readJsonCache<CrawlItem>(indexPath)
  let chosen: CrawlItem
  if (cached) {
    chosen = cached
  } else {
    const { items } = await crawlSearch(config, opts.params)
    const first = items.find((it) => it.downloadUrl)
    if (!first) throw new Error(`crawlVideo(${opts.provider}): no item with downloadUrl`)
    chosen = first
    await writeAtomic(indexPath, JSON.stringify(chosen, null, 2))
  }

  const ext = extFromUrl(chosen.downloadUrl!, 'mp4')
  const filePath = cachePath('videos', cacheKey(['crawl-video', opts.provider, chosen.downloadUrl!]), ext)
  if (!cacheExists(filePath)) {
    const buf = await crawlDownload(chosen.downloadUrl!)
    await writeAtomic(filePath, buf)
  }

  return {
    kind: 'video',
    path: filePath,
    source: {
      provider: tagFor(opts.provider),
      id: chosen.pageUrl?.match(/\/(\d+)/)?.[1] ?? undefined,
      url: chosen.pageUrl ?? undefined,
      attribution: chosen.title ?? undefined,
    },
  }
}
