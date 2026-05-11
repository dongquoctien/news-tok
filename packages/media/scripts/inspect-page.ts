/**
 * Open a provider's search URL with the same stealthy Playwright context the
 * crawler uses, then dump:
 *   1. items extracted by the provider config (so we can see which fields
 *      are still hitting and which are blank)
 *   2. up to 3 raw `outerHTML` samples so we can guess the new selector
 *
 * Run from this package's directory (it imports playwright + ../src):
 *   pnpm --filter @news-tok/media exec tsx scripts/inspect-page.ts pexels-video "city night"
 */
import { withPage } from '../src/crawler/browser.js'
import { crawlSearch } from '../src/crawler/crawl.js'
import { loadProvider } from '../src/crawler/registry.js'
import { closeBrowser } from '../src/crawler/browser.js'

async function main() {
  const provider = process.argv[2] ?? 'pexels-video'
  const query = process.argv[3] ?? 'city night'

  const config = await loadProvider(provider)
  console.log(`# provider=${provider} kind=${config.kind}`)
  console.log(`# url=${config.search.url}`)
  console.log(`# query=${query}`)

  // 1. Try the provider's own extract rules. Surface but don't fail on errors —
  // a broken waitFor is exactly the kind of thing we're here to debug.
  try {
    const result = await crawlSearch(config, { query, orientation: 'portrait' })
    console.log(`\n## extracted (${result.items.length} items) — first 5:`)
    console.log(JSON.stringify(result.items.slice(0, 5), null, 2))
  } catch (err) {
    console.log(`\n## crawlSearch threw: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2. Re-open the page, ignore waitFor, dump candidate selectors so we can
  // pick a fresh one.
  const searchUrl = config.search.url
    .replace('{query}', encodeURIComponent(query))
    .replace('{orientation}', 'portrait')
    .replace('{durationSec}', '')
  await withPage(async (page) => {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
    if (config.search.waitFor) {
      await page
        .waitForSelector(config.search.waitFor.selector, { timeout: 8_000 })
        .catch(() => {
          console.log(`# waitFor=${config.search.waitFor!.selector} TIMED OUT (continuing)`)
        })
    }
    // Try the configured items selector first.
    const samples = await page.$$eval(config.search.extract.items, (els) =>
      els.slice(0, 3).map((el) => el.outerHTML.slice(0, 2500))
    ).catch((e: Error) => {
      console.log(`# items selector "${config.search.extract.items}" failed: ${e.message}`)
      return [] as string[]
    })
    console.log(`\n## raw outerHTML (first 3, max 2500 chars each):`)
    for (let i = 0; i < samples.length; i += 1) {
      console.log(`\n### sample ${i}:\n${samples[i]}`)
    }
    // Heuristic dump: count likely result-grid containers so we can pick a
    // replacement selector.
    const stats = await page.evaluate(() => {
      const buckets: Record<string, number> = {}
      const candidates = [
        'article',
        '[data-pin-id]',
        '[data-result-id]',
        'a[href^="/photos/"]',
        'a[href*="/photo-"]',
        'a[href*="/images/id/"]',
        'main img',
        '[class*="results"]',
        '[class*="container"]',
      ]
      for (const sel of candidates) {
        buckets[sel] = document.querySelectorAll(sel).length
      }
      return buckets
    })
    console.log(`\n## candidate-selector counts:\n${JSON.stringify(stats, null, 2)}`)

    // Dump a few promising candidates.
    const probeSelectors = ['a[href^="/photos/"]', '[class*="results"]']
    for (const sel of probeSelectors) {
      const dumps = await page
        .$$eval(sel, (els) => els.slice(0, 2).map((el) => el.outerHTML.slice(0, 1500)))
        .catch(() => [] as string[])
      console.log(`\n## probe "${sel}" — first ${dumps.length}:`)
      for (const d of dumps) console.log(`---\n${d}`)
    }
  })

  await closeBrowser()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
