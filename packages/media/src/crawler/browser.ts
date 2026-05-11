import type { APIRequestContext, Browser, BrowserContext, Page } from 'playwright'

let browserPromise: Promise<Browser> | null = null
let idleTimer: NodeJS.Timeout | null = null
const IDLE_CLOSE_MS = 60_000

async function launchBrowser(): Promise<Browser> {
  // Dynamic import keeps Playwright off the load path for callers that
  // never touch the crawler (tsx scripts, the MCP server build, etc.).
  const { chromium } = await import('playwright')
  return chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  })
}

function bumpIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    void closeBrowser()
  }, IDLE_CLOSE_MS)
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser()
  }
  bumpIdle()
  return browserPromise
}

export async function closeBrowser(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  if (!browserPromise) return
  const browser = await browserPromise
  browserPromise = null
  try {
    await browser.close()
  } catch {
    // Browser may already be closing; ignore.
  }
}

/**
 * Build a stealthy browser context. The combination of viewport, UA,
 * locale, and timezone is what Cloudflare's bot heuristic latches onto;
 * we mimic a recent desktop Chrome on Windows.
 */
export async function newStealthContext(): Promise<BrowserContext> {
  const browser = await getBrowser()
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'Asia/Ho_Chi_Minh',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    },
  })
  // Hide the webdriver flag — a one-line tell that Cloudflare checks.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  return ctx
}

/**
 * Run `fn` with a fresh page that auto-closes (and bumps idle timeout)
 * on exit. Callers don't manage page lifecycle.
 */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const ctx = await newStealthContext()
  const page = await ctx.newPage()
  try {
    return await fn(page)
  } finally {
    bumpIdle()
    await ctx.close()
  }
}

/**
 * Run `fn` against the stealthy context's APIRequestContext. Use this for
 * binary downloads — `page.goto` on an asset URL fails with "Download is
 * starting" because Chromium intercepts it as a file download. The context
 * carries the same cookies, JA3 fingerprint, and CF clearance tokens, so
 * hotlink-protected URLs that fail under plain `fetch` succeed here.
 */
export async function withRequest<T>(fn: (request: APIRequestContext) => Promise<T>): Promise<T> {
  const ctx = await newStealthContext()
  try {
    return await fn(ctx.request)
  } finally {
    bumpIdle()
    await ctx.close()
  }
}
