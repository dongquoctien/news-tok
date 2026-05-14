/**
 * Network smoke for media adapters that need API keys / network access.
 * Loads .env from repo root, then exercises each provider sequentially.
 *
 * Run: pnpm smoke:media:network
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { archive, openverse, pexels, pixabay, unsplash, wikimedia } from '@news-tok/media'

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim())
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]
  }
}

async function tryRun(label: string, fn: () => Promise<unknown>): Promise<void> {
  console.log(`[media-net] ${label}...`)
  try {
    const result = await fn()
    console.log(`  ok — ${JSON.stringify(result)}`)
  } catch (err) {
    console.log(`  FAIL — ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function main() {
  loadDotEnv()

  if (process.env.PEXELS_API_KEY) {
    await tryRun('pexels.searchImage("mountain", portrait)', async () => {
      const img = await pexels.searchImage({ query: 'mountain', orientation: 'portrait' })
      const size = statSync(img.path).size
      return { path: img.path, dim: `${img.width}x${img.height}`, kb: (size / 1024) | 0, by: img.source.attribution }
    })
  }

  if (process.env.UNSPLASH_ACCESS_KEY) {
    await tryRun('unsplash.searchImage("ocean", landscape)', async () => {
      const img = await unsplash.searchImage({ query: 'ocean', orientation: 'landscape' })
      const size = statSync(img.path).size
      return { path: img.path, dim: `${img.width}x${img.height}`, kb: (size / 1024) | 0, by: img.source.attribution }
    })
  } else {
    console.log('[media-net] (skip Unsplash — UNSPLASH_ACCESS_KEY not set)')
  }

  if (process.env.PIXABAY_API_KEY) {
    await tryRun('pixabay.searchImage("forest")', async () => {
      const img = await pixabay.searchImage({ query: 'forest' })
      const size = statSync(img.path).size
      return { path: img.path, dim: `${img.width}x${img.height}`, kb: (size / 1024) | 0, by: img.source.attribution }
    })
    await tryRun('pixabay.searchMusic("calm", 30s)', async () => {
      const music = await pixabay.searchMusic({ mood: 'calm', durationSec: 30 })
      const size = statSync(music.path).size
      return { path: music.path, sec: music.durationSec, kb: (size / 1024) | 0, by: music.source.attribution }
    })
  }

  await tryRun('archive.searchMusic("ambient", 60s)', async () => {
    const music = await archive.searchMusic({ mood: 'ambient', durationSec: 60 })
    const size = statSync(music.path).size
    return { path: music.path, sec: music.durationSec, kb: (size / 1024) | 0, by: music.source.attribution }
  })

  // Wikimedia + Openverse need no key — exercise both with a proper
  // noun so we catch regressions in their JSON shape (the entity that
  // most differentiates them from Pexels/Unsplash).
  await tryRun('wikimedia.searchImage("Eiffel Tower", landscape)', async () => {
    const img = await wikimedia.searchImage({
      query: 'Eiffel Tower',
      orientation: 'landscape',
    })
    const size = statSync(img.path).size
    return {
      path: img.path,
      dim: `${img.width}x${img.height}`,
      kb: (size / 1024) | 0,
      by: img.source.attribution,
    }
  })

  await tryRun('openverse.searchImage("Hoang Sa")', async () => {
    const img = await openverse.searchImage({ query: 'Hoang Sa' })
    const size = statSync(img.path).size
    return {
      path: img.path,
      dim: `${img.width}x${img.height}`,
      kb: (size / 1024) | 0,
      by: img.source.attribution,
    }
  })

  console.log('[media-net] done')
}

main().catch((err) => {
  console.error('[media-net] fatal:', err)
  process.exit(1)
})
