import { writeAtomic, cacheExists } from './cache.js'

/**
 * Download a binary asset (image/audio) to `path` if it doesn't already exist.
 * Returns `path` either way so callers can use it as cache-aware.
 */
export async function downloadToCache(
  url: string,
  path: string,
  init?: RequestInit
): Promise<string> {
  if (cacheExists(path)) return path
  const res = await fetch(url, init)
  if (!res.ok) {
    throw new Error(`Download failed (${res.status} ${res.statusText}): ${url}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeAtomic(path, buf)
  return path
}
