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

export type ArchiveListMusicOptions = ArchiveMusicOptions & {
  /** Maximum number of candidates to return. Default 8 — wide enough for
   *  a UI grid but tight enough that the metadata probe finishes in
   *  ~5-10s on a cold cache. */
  limit?: number
}

/** Track candidate plus a streamable URL the UI can hit directly to
 *  audition (Studio rewrites it through a /api/asset proxy so the user
 *  doesn't have to download the full file to cache before deciding). */
export type ArchiveTrackCandidate = {
  identifier: string
  fileName: string
  /** Direct stream URL on archive.org's CDN. */
  streamUrl: string
  /** Public archive.org details page (for credit + manual inspection). */
  pageUrl: string
  title?: string
  creator?: string
  licenseurl?: string
  durationSec?: number
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

  // Probe up to 12 items for mp3 files (we need enough variety to fill
  // a UI grid after sorting + length-prefer pass eliminates short tracks).
  const candidates: PickedTrack[] = []
  const probeLimit = Math.min(docs.length, 12)
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
  // Sort: prefer tracks at least as long as the target. A track that
  // covers the whole video sounds clean; a shorter one has to loop and
  // the loop seam is audible. Penalise short tracks heavily so 32s
  // beats 28s for a 30s video — but still allow a much shorter pick if
  // the only long option is wildly off (e.g. 600s when target is 30s,
  // which would force aggressive volume duck on the tail anyway).
  candidates.sort((a, b) => scoreTrack(a, opts.durationSec) - scoreTrack(b, opts.durationSec))
  return candidates
}

/**
 * Lower score wins. Tracks long enough to cover the video score by the
 * positive gap (over-length penalty kept mild — Remotion already fades
 * the tail). Tracks shorter than the video pay a fixed `SHORT_PENALTY`
 * so they never out-rank any equal-or-longer candidate unless every
 * long candidate is preposterously off.
 */
function scoreTrack(track: PickedTrack, targetSec: number): number {
  const dur = track.durationSec ?? 0
  if (dur >= targetSec) return dur - targetSec
  // Penalise short tracks: deficit + a constant so an equal-deficit
  // shorter track always loses to any longer one. 60s constant means
  // a 25s track for a 30s target (deficit 5s) only ties a 90s track
  // (overage 60s) — the 90s wins on absolute scoring beyond that.
  return targetSec - dur + 60
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
    // Re-sort old cache files against the new prefer-length-over-target
    // rule. See listMusic() for the full rationale.
    candidates = [...candidates].sort(
      (a, b) => scoreTrack(a, opts.durationSec) - scoreTrack(b, opts.durationSec)
    )
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

/**
 * Return the top N candidate tracks for a mood, sorted by the same
 * "prefer length >= target" rule searchMusic uses. Unlike searchMusic,
 * this DOES NOT download anything; each candidate carries a streamable
 * URL so the UI can audition without writing the file to cache first.
 *
 * The result is cached by the same key family as searchMusic so two
 * round-trips don't re-probe archive.org's metadata. searchMusic and
 * listMusic share the same underlying candidate index — once one runs,
 * the other is fast.
 */
export async function listMusic(opts: ArchiveListMusicOptions): Promise<ArchiveTrackCandidate[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 20))
  const cachedIndex = cachePath(
    'music',
    cacheKey(['archive', 'searchMusic', opts.mood, opts.durationSec]),
    'json'
  )
  let candidates: PickedTrack[]
  if (cacheExists(cachedIndex)) {
    candidates = JSON.parse(await readFile(cachedIndex, 'utf8')) as PickedTrack[]
    // Re-sort on read: older cache files were written with the
    // closest-match sort, which doesn't honour the new
    // prefer-length-over-target rule. Resorting is O(n log n) on a
    // 12-track list — negligible — and guarantees correctness without
    // bumping the cache key (which would force every existing project
    // to re-probe archive.org's metadata).
    candidates = [...candidates].sort(
      (a, b) => scoreTrack(a, opts.durationSec) - scoreTrack(b, opts.durationSec)
    )
  } else {
    candidates = await findCandidates(opts)
    if (candidates.length === 0) {
      throw new Error(`Archive: no commercial-friendly tracks for mood "${opts.mood}"`)
    }
    await writeAtomic(cachedIndex, JSON.stringify(candidates, null, 2))
  }
  return candidates.slice(0, limit).map((track) => ({
    identifier: track.identifier,
    fileName: track.fileName,
    streamUrl: `https://archive.org/download/${encodeURIComponent(track.identifier)}/${encodeURIComponent(track.fileName)}`,
    pageUrl: `https://archive.org/details/${track.identifier}`,
    title: track.title,
    creator: track.creator,
    licenseurl: track.licenseurl,
    durationSec: track.durationSec,
  }))
}

/**
 * Resolve a previously-listed candidate to a cached AssetRef. Use this
 * after the user picks a track from the listMusic grid so we only
 * download the one they actually want, not every audition.
 */
export async function fetchMusic(
  candidate: Pick<ArchiveTrackCandidate, 'identifier' | 'fileName' | 'title' | 'creator' | 'durationSec'>
): Promise<AssetRef> {
  const downloadUrl = `https://archive.org/download/${encodeURIComponent(candidate.identifier)}/${encodeURIComponent(candidate.fileName)}`
  const filePath = cachePath(
    'music',
    cacheKey(['archive', candidate.identifier, candidate.fileName]),
    'mp3'
  )
  await downloadToCache(downloadUrl, filePath, { headers: { 'User-Agent': UA } })
  return {
    kind: 'audio',
    path: filePath,
    source: {
      provider: 'archive',
      id: candidate.identifier,
      url: `https://archive.org/details/${candidate.identifier}`,
      attribution: candidate.creator ?? candidate.title,
    },
    durationSec: candidate.durationSec,
  }
}
