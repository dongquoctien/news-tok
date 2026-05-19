/**
 * Smoke test for the article extractor with stealth-browser fallback.
 * Usage: tsx scripts/smoke-extract.ts [url]
 *
 * Default URL is the nld.com.vn anti-bot CAPTCHA page that triggered
 * the production bug — extractArticle must either reach the real
 * body via the Chromium fallback or throw a clean "article too short"
 * error. A silent success with empty body is the failure mode we're
 * guarding against.
 */
import { extractArticle, crawler } from '@news-tok/media'

const url =
  process.argv[2] ??
  'https://nld.com.vn/pha-duong-day-buon-lau-hon-8000-luong-vang-tri-gia-1200-ti-dong-196260519185645046.htm'

async function main(): Promise<void> {
  let exitCode = 0
  try {
    console.log('[smoke] extracting:', url)
    const t0 = Date.now()
    const a = await extractArticle(url, { force: true, skipMediaDownload: true })
    console.log('[smoke] ok in', Date.now() - t0, 'ms')
    console.log('  title:', a.title.slice(0, 100))
    console.log('  textLen:', a.text.length)
    console.log('  textHead:', a.text.slice(0, 200))
  } catch (err) {
    console.error('[smoke] failed:', err instanceof Error ? err.message : String(err))
    exitCode = 1
  } finally {
    // Close the stealth browser explicitly so the smoke script can exit
    // instead of waiting for the 60s idle-close timer.
    await crawler.closeBrowser()
  }
  process.exit(exitCode)
}

void main()
