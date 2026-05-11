import { readFile } from 'node:fs/promises'
import type { AssetRef } from '@news-tok/shared/schema'
import { cacheExists, cacheKey, cachePath, writeAtomic } from './cache.js'
import { downloadToCache } from './download.js'

const SEARCH_API = 'https://archive.org/advancedsearch.php'
const METADATA_API = 'https://archive.org/metadata'

export type ArchiveMusicOptions = {
  mood: string
  durationSec: number
}

type ArchiveSearchResponse = {
  response?: {
    numFound: number
    docs: Array<{
      identifier: string
      title?: string
      creator?: string | string[]
      licenseurl?: string
      runtime?: string
    }>
  }
}

type ArchiveMetadata = {
  files?: Array<{
    name: string
    format?: string
    length?: string
    size?: string
  }>
}

type PickedTrack = {
  identifier: string
  fileName: string
  title?: string
  creator?: string
  licenseurl?: string
  durationSec?: number
}

// Reasonable User-Agent — Internet Archive does not block Node, but
// the WMF/IA convention is to identify yourself.
const UA = 'news-tok/0.1 (+https://github.com/itdongquoctien/news-tok)'

function parseDuration(s: string | undefined): number | undefined {
  if (!s) return undefined
  // "196.47" or "3:16" forms.
  if (/^\d+(\.\d+)?$/.test(s)) return Number.parseFloat(s)
  const m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s)
  if (!m) return undefined
  if (m[3]) {
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
  return Number(m[1]) * 60 + Number(m[2])
}

async function findCandidates(opts: ArchiveMusicOptions): Promise<PickedTrack[]> {
  // Commercial-friendly licenses: public domain and CC-BY / CC-BY-SA, no NC, no ND.
  const q = [
    'mediatype:audio',
    'licenseurl:*creativecommons*',
    'NOT licenseurl:*nc*',
    'NOT licenseurl:*nd*',
    `subject:${opts.mood}`,
  ].join(' AND ')

  const params = new URLSearchParams({
    q,
    rows: '20',
    sort: 'downloads desc',
    output: 'json',
  })
  for (const f of ['identifier', 'title', 'creator', 'licenseurl', 'runtime']) {
    params.append('fl[]', f)
  }

  const res = await fetch(`${SEARCH_API}?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Archive search failed (${res.status} ${res.statusText}): ${opts.mood}`)
  }
  const json = (await res.json()) as ArchiveSearchResponse
  const docs = json.response?.docs ?? []
  if (docs.length === 0) return []

  // Probe up to 6 items for mp3 files, ordered by closeness to target duration.
  const candidates: PickedTrack[] = []
  const probeLimit = Math.min(docs.length, 6)
  for (let i = 0; i < probeLimit; i++) {
    const doc = docs[i]!
    const meta = await fetch(`${METADATA_API}/${doc.identifier}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!meta.ok) continue
    const m = (await meta.json()) as ArchiveMetadata
    const mp3s = (m.files ?? []).filter((f) => /\.mp3$/i.test(f.name))
    for (const file of mp3s) {
      const dur = parseDuration(file.length)
      if (!dur || dur < 10) continue
      candidates.push({
        identifier: doc.identifier,
        fileName: file.name,
        title: doc.title,
        creator: Array.isArray(doc.creator) ? doc.creator.join(', ') : doc.creator,
        licenseurl: doc.licenseurl,
        durationSec: dur,
      })
    }
  }
  candidates.sort(
    (a, b) =>
      Math.abs((a.durationSec ?? 0) - opts.durationSec) -
      Math.abs((b.durationSec ?? 0) - opts.durationSec)
  )
  return candidates
}

export async function searchMusic(opts: ArchiveMusicOptions): Promise<AssetRef> {
  const cachedIndex = cachePath(
    'music',
    cacheKey(['archive', 'searchMusic', opts.mood, opts.durationSec]),
    'json'
  )
  let candidates: PickedTrack[]
  if (cacheExists(cachedIndex)) {
    candidates = JSON.parse(await readFile(cachedIndex, 'utf8')) as PickedTrack[]
  } else {
    candidates = await findCandidates(opts)
    if (candidates.length === 0) {
      throw new Error(`Archive: no commercial-friendly tracks for mood "${opts.mood}"`)
    }
    await writeAtomic(cachedIndex, JSON.stringify(candidates, null, 2))
  }

  // Try downloading from the best candidate; if the IA CDN node returns
  // 5xx for that file, fall through to the next candidate.
  const errors: string[] = []
  for (const track of candidates.slice(0, 6)) {
    const downloadUrl = `https://archive.org/download/${encodeURIComponent(track.identifier)}/${encodeURIComponent(track.fileName)}`
    const filePath = cachePath('music', cacheKey(['archive', track.identifier, track.fileName]), 'mp3')
    try {
      await downloadToCache(downloadUrl, filePath, { headers: { 'User-Agent': UA } })
      return {
        kind: 'audio',
        path: filePath,
        source: {
          provider: 'archive',
          id: track.identifier,
          url: `https://archive.org/details/${track.identifier}`,
          attribution: track.creator ?? track.title,
        },
        durationSec: track.durationSec,
      }
    } catch (err) {
      errors.push(
        `${track.identifier}/${track.fileName}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  throw new Error(
    `Archive: all ${candidates.length} candidate downloads failed:\n  ${errors.join('\n  ')}`
  )
}
