import type { Page } from 'playwright'
import { withPage, withRequest } from './browser.js'
import type {
  CrawlItem,
  CrawlResult,
  ExtractRules,
  FieldRule,
  ProviderConfig,
  SearchParams,
} from './providers/types.js'

function fillTemplate(template: string, params: SearchParams): string {
  const vals: Record<string, string> = {
    query: encodeURIComponent(params.query),
    orientation: params.orientation ?? '',
    durationSec: params.durationSec != null ? String(Math.round(params.durationSec)) : '',
  }
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vals[k] ?? '')
}

function applyRegex(value: string, regex: string | undefined): string {
  if (!regex) return value
  const m = new RegExp(regex).exec(value)
  return m ? (m[1] ?? m[0]) : value
}

async function extractItems(page: Page, rules: ExtractRules): Promise<CrawlItem[]> {
  // Playwright serializes the callback into the page context. We deliberately
  // avoid named inner declarations (functions, arrows assigned to `const`)
  // because esbuild/tsx wrap those in a `__name(...)` helper that does not
  // exist in the page realm, producing `ReferenceError: __name is not defined`.
  // Everything below is inline using `.map(...)`.
  const raw = await page.$$eval(
    rules.items,
    (roots, { fields }: { fields: Record<string, FieldRule> }) =>
      roots.map((root) => {
        const out: Record<string, string> = {}
        for (const [name, rule] of Object.entries(fields)) {
          const el =
            rule.selector === ':self' ? (root as Element) : root.querySelector(rule.selector)
          let value = ''
          if (el) {
            if (rule.attr) {
              value = el.getAttribute(rule.attr) ?? ''
            } else if (rule.css) {
              const view = el.ownerDocument?.defaultView ?? window
              value = view.getComputedStyle(el).getPropertyValue(rule.css) ?? ''
            } else {
              value = (el.textContent ?? '').trim()
            }
          }
          out[name] = value
        }
        return out
      }),
    { fields: rules.itemFields }
  )

  // Node-side regex post-processing.
  return raw.map((item) => {
    const next: CrawlItem = {}
    for (const [name, value] of Object.entries(item)) {
      const rule = rules.itemFields[name]!
      next[name] = applyRegex(String(value ?? ''), rule.regex)
    }
    return next
  })
}

export async function crawlSearch(
  config: ProviderConfig,
  params: SearchParams
): Promise<CrawlResult> {
  const searchUrl = fillTemplate(config.search.url, params)
  return withPage(async (page) => {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    if (config.search.waitFor) {
      await page.waitForSelector(config.search.waitFor.selector, {
        timeout: config.search.waitFor.timeoutMs,
      })
    }
    const items = await extractItems(page, config.search.extract)
    return { items, searchUrl }
  })
}

/**
 * Download a file URL using the same browser context (cookies/CF tokens
 * carried over). Uses the context's request API rather than `page.goto`
 * because binary asset URLs (Content-Disposition: attachment) trigger a
 * Chromium download and never resolve as a navigation. Returns the Buffer;
 * caller writes it to cache.
 */
export async function crawlDownload(downloadUrl: string): Promise<Buffer> {
  return withRequest(async (request) => {
    const response = await request.get(downloadUrl, { timeout: 60_000 })
    if (!response.ok()) {
      throw new Error(
        `Download failed (${response.status()} ${response.statusText()}): ${downloadUrl}`
      )
    }
    return Buffer.from(await response.body())
  })
}
