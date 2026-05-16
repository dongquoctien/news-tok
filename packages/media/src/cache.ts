import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { cacheNamespaceRoot } from './paths.js'

export type CacheNamespace =
  | 'images'
  | 'videos'
  | 'music'
  | 'tts'
  | 'articles'
  | 'uploads'
  // Pre-computed waveform peaks JSON for the Studio bgMusic trimmer UI.
  // Keyed by the SOURCE mp3's content hash so re-trimming the same track
  // across projects hits a single cache file (~2KB / 3 min audio).
  | 'peaks'

export function cacheKey(parts: unknown[]): string {
  const h = createHash('sha256')
  for (const p of parts) {
    h.update(typeof p === 'string' ? p : JSON.stringify(p))
    h.update('\x1f')
  }
  return h.digest('hex').slice(0, 24)
}

export function cachePath(namespace: CacheNamespace, key: string, ext: string): string {
  const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext
  return resolve(cacheNamespaceRoot(namespace), `${key}.${cleanExt}`)
}

export function cacheExists(path: string): boolean {
  return existsSync(path)
}

export async function writeAtomic(path: string, data: Buffer | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}
