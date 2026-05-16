/**
 * Smoke test for @news-tok/media extractPeaks against a real mp3 in the
 * data/cache/music/ folder. Not run by default (manual `pnpm exec tsx
 * scripts/smoke-peaks.ts`) because it depends on disk state.
 */
import { extractPeaks } from '@news-tok/media'
import { readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

async function main(): Promise<void> {
  // data/ is gitignored and not duplicated into worktrees — point at the
  // origin repo's cache instead so this script works from any worktree.
  const cacheDir =
    process.env.NEWSTOK_MUSIC_DIR ?? resolve(here, '..', 'data', 'cache', 'music')
  const files = await readdir(cacheDir)
  const mp3 = files.find((f) => f.endsWith('.mp3'))
  if (!mp3) {
    process.stderr.write(`no mp3 in ${cacheDir} — run an MCP searchMusic first\n`)
    process.exit(2)
  }
  const path = resolve(cacheDir, mp3)
  process.stdout.write(`source: ${path}\n`)

  console.time('cold extract')
  const r = await extractPeaks(path, { targetSamples: 200 })
  console.timeEnd('cold extract')
  process.stdout.write(
    `duration: ${r.durationSec.toFixed(1)}s, peaks: ${r.peaks.length}, max: ${Math.max(...r.peaks).toFixed(3)}\n`
  )

  console.time('cached extract')
  await extractPeaks(path, { targetSamples: 200 })
  console.timeEnd('cached extract')
}

main().catch((err) => {
  process.stderr.write(
    `smoke-peaks failed: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(1)
})
