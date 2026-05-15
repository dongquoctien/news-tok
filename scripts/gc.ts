#!/usr/bin/env tsx
/**
 * Garbage-collect cache directories that grow unbounded.
 *
 * Two stores get cleaned:
 *
 *   1. `.remotion-cache/<hash>/` — every unique combo of custom scenes
 *      + layouts + assets gets its own bundle dir (~150 MB each). A
 *      week of active development produces tens of these. We delete
 *      bundle dirs whose `mtime` is older than 14 days.
 *
 *   2. `data/cache/{images,videos,music,tts,articles,uploads}/` — the
 *      hash-keyed asset cache. Grows linearly forever as the user
 *      gens projects. We LRU-trim each namespace down to a per-
 *      namespace cap (sum ≈ 5 GB) by deleting the oldest-`atime`
 *      files first.
 *
 * Idempotent. Safe to run on a schedule (eg. cron weekly) — files
 * still in use within the TTL window won't be touched. Files cited by
 * a current storyboard's AssetRef.path are NOT specially preserved;
 * if the user hasn't opened a project in 14+ days and its assets fall
 * out of cache, the render path will re-fetch them on next open.
 *
 * Usage:
 *   pnpm tsx scripts/gc.ts              # actually delete
 *   pnpm tsx scripts/gc.ts --dry        # report what would be deleted
 *   pnpm tsx scripts/gc.ts --bundle-only
 *   pnpm tsx scripts/gc.ts --cache-only
 */

import { readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '@news-tok/shared/paths'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry') || argv.includes('--dry-run')
const bundleOnly = argv.includes('--bundle-only')
const cacheOnly = argv.includes('--cache-only')

const BUNDLE_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

// Per-namespace caps inside data/cache/. Sum is ~5 GB, biased toward
// images + tts which dominate news-tok output. Tune by namespace
// rather than a single global so a flood of one type doesn't starve
// the others.
const CACHE_CAPS_BYTES: Record<string, number> = {
  images: 2 * 1024 * 1024 * 1024, // 2 GB — Pexels JPEGs at 2-4 MB each
  videos: 500 * 1024 * 1024, //       500 MB — rarely used
  music: 1 * 1024 * 1024 * 1024, //   1 GB — Internet Archive mp3s
  tts: 1 * 1024 * 1024 * 1024, //     1 GB — Edge TTS mp3s, < 200 KB each
  articles: 100 * 1024 * 1024, //     100 MB — JSON blobs only
  uploads: 500 * 1024 * 1024, //      500 MB — user uploads
  downloads: 500 * 1024 * 1024, //    500 MB — per-project subtitle/voice zips
}

const BUNDLE_DIR = resolve(REPO_ROOT, '.remotion-cache')
const CACHE_DIR = resolve(REPO_ROOT, 'data', 'cache')

type FileEntry = { path: string; size: number; atimeMs: number }

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function dirSizeAndFiles(dir: string): Promise<{ files: FileEntry[]; total: number }> {
  const files: FileEntry[] = []
  let total = 0
  if (!existsSync(dir)) return { files, total }
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = resolve(dir, e.name)
    if (e.isDirectory()) {
      const inner = await dirSizeAndFiles(p)
      files.push(...inner.files)
      total += inner.total
    } else if (e.isFile()) {
      try {
        const st = await stat(p)
        files.push({ path: p, size: st.size, atimeMs: st.atimeMs })
        total += st.size
      } catch {
        // file vanished between readdir and stat — skip
      }
    }
  }
  return { files, total }
}

async function gcBundleCache(): Promise<void> {
  if (!existsSync(BUNDLE_DIR)) {
    process.stdout.write(`bundle cache: ${BUNDLE_DIR} does not exist, skipping\n`)
    return
  }
  const cutoff = Date.now() - BUNDLE_TTL_MS
  const entries = await readdir(BUNDLE_DIR, { withFileTypes: true })
  let deletedCount = 0
  let deletedBytes = 0
  let keptCount = 0

  for (const e of entries) {
    if (!e.isDirectory()) continue
    const p = resolve(BUNDLE_DIR, e.name)
    let st
    try {
      st = await stat(p)
    } catch {
      continue
    }
    if (st.mtimeMs >= cutoff) {
      keptCount += 1
      continue
    }
    // Bundle dirs are big — compute size once for the report.
    const { total } = await dirSizeAndFiles(p)
    deletedCount += 1
    deletedBytes += total
    process.stdout.write(
      `  ${dryRun ? 'DRY' : '✓'}  rm ${e.name}  (${fmtBytes(total)}, ${Math.round(
        (Date.now() - st.mtimeMs) / (24 * 60 * 60 * 1000)
      )}d old)\n`
    )
    if (!dryRun) {
      try {
        await rm(p, { recursive: true, force: true })
      } catch (err) {
        process.stderr.write(
          `     ✗ failed to rm: ${err instanceof Error ? err.message : String(err)}\n`
        )
      }
    }
  }

  process.stdout.write(
    `bundle cache: ${dryRun ? 'would delete' : 'deleted'} ${deletedCount} dir${
      deletedCount === 1 ? '' : 's'
    } (${fmtBytes(deletedBytes)}); kept ${keptCount} fresh\n\n`
  )
}

async function gcCacheNamespace(name: string, capBytes: number): Promise<void> {
  const dir = resolve(CACHE_DIR, name)
  if (!existsSync(dir)) return

  const { files, total } = await dirSizeAndFiles(dir)
  if (total <= capBytes) {
    process.stdout.write(
      `  ${name}: ${fmtBytes(total)} / ${fmtBytes(capBytes)} cap — OK\n`
    )
    return
  }

  // Oldest atime first so frequently-used assets survive the trim.
  files.sort((a, b) => a.atimeMs - b.atimeMs)

  let freed = 0
  let removed = 0
  const targetFreeBytes = total - capBytes
  for (const f of files) {
    if (freed >= targetFreeBytes) break
    freed += f.size
    removed += 1
    if (!dryRun) {
      try {
        await rm(f.path, { force: true })
      } catch {
        // ignore — best effort
      }
    }
  }
  process.stdout.write(
    `  ${name}: ${fmtBytes(total)} → ${fmtBytes(total - freed)} (${
      dryRun ? 'would delete' : 'deleted'
    } ${removed} file${removed === 1 ? '' : 's'}, freed ${fmtBytes(freed)})\n`
  )
}

async function gcAssetCache(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    process.stdout.write(`asset cache: ${CACHE_DIR} does not exist, skipping\n`)
    return
  }
  process.stdout.write('asset cache:\n')
  for (const [name, cap] of Object.entries(CACHE_CAPS_BYTES)) {
    await gcCacheNamespace(name, cap)
  }
  process.stdout.write('\n')
}

async function main() {
  if (dryRun) process.stdout.write('DRY RUN — nothing will be deleted.\n\n')

  if (!cacheOnly) {
    process.stdout.write(
      `--- bundle cache (.remotion-cache/) — TTL ${BUNDLE_TTL_MS / (24 * 60 * 60 * 1000)} days ---\n`
    )
    await gcBundleCache()
  }
  if (!bundleOnly) {
    process.stdout.write('--- asset cache (data/cache/) — per-namespace caps ---\n')
    await gcAssetCache()
  }

  if (dryRun) {
    process.stdout.write('Re-run without --dry to apply.\n')
  }
}

main().catch((err) => {
  process.stderr.write(`GC failed: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
