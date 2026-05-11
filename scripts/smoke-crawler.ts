/**
 * Smoke test for the Playwright crawler.
 *
 * Exercises a few providers end-to-end against the real internet:
 *   - pixabay-image (Cloudflare-fronted JSON API blocks Node; crawler should
 *     still get through because Playwright drives real Chromium)
 *   - pexels-video (no public JSON API for video; crawl-only path)
 *
 * Each provider call must:
 *   1. resolve to an AssetRef whose `path` exists on disk and is > 0 bytes
 *   2. carry a `source.provider` tag that matches the provider family
 *
 * Run: pnpm tsx scripts/smoke-crawler.ts [provider...]
 *   e.g. pnpm tsx scripts/smoke-crawler.ts pexels-video
 * With no args, runs all cases.
 */
import { statSync } from 'node:fs'
import { crawler } from '@news-tok/media'

type Case = {
  label: string
  provider: string
  expectedProviderTag: string
  run: () => Promise<{ path: string; source: { provider: string } }>
}

const cases: Case[] = [
  {
    label: 'pixabay-image / "ocean sunset"',
    provider: 'pixabay-image',
    expectedProviderTag: 'pixabay',
    run: () =>
      crawler.crawlImage({
        provider: 'pixabay-image',
        params: { query: 'ocean sunset', orientation: 'landscape' },
      }),
  },
  {
    label: 'pexels-video / "forest river"',
    provider: 'pexels-video',
    expectedProviderTag: 'pexels',
    run: () =>
      crawler.crawlVideo({
        provider: 'pexels-video',
        params: { query: 'forest river', orientation: 'portrait' },
      }),
  },
]

async function main() {
  const filter = process.argv.slice(2)
  const selected = filter.length ? cases.filter((c) => filter.includes(c.provider)) : cases
  if (selected.length === 0) {
    console.error(`[crawler] no matching cases for: ${filter.join(', ')}`)
    process.exit(1)
  }

  let failed = 0
  for (const c of selected) {
    const started = Date.now()
    try {
      const asset = await c.run()
      const stat = statSync(asset.path)
      if (stat.size <= 0) {
        throw new Error(`asset at ${asset.path} is 0 bytes`)
      }
      if (asset.source.provider !== c.expectedProviderTag) {
        throw new Error(
          `source.provider=${asset.source.provider} expected ${c.expectedProviderTag}`
        )
      }
      const ms = Date.now() - started
      console.log(
        `[crawler] OK  ${c.label}: ${asset.path} (${(stat.size / 1024).toFixed(1)} KiB, ${ms} ms)`
      )
    } catch (err) {
      failed += 1
      const ms = Date.now() - started
      const msg = err instanceof Error ? err.stack ?? err.message : String(err)
      console.error(`[crawler] FAIL ${c.label} (${ms} ms): ${msg}`)
    }
  }
  await crawler.closeBrowser()
  if (failed) {
    console.error(`[crawler] ${failed}/${selected.length} case(s) failed`)
    process.exit(1)
  }
  console.log(`[crawler] ${selected.length}/${selected.length} cases passed`)
}

main().catch((err) => {
  console.error('[crawler] fatal:', err)
  process.exit(1)
})
