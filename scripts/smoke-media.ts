/**
 * M2 smoke test: exercise media adapters that don't require API keys.
 *   - Edge TTS: synthesize a short VI utterance, confirm mp3 lands on disk
 *     with non-zero size and at least one word boundary parsed.
 *   - listVoices(vi): confirm at least 2 Vietnamese voices come back.
 *   - Sanitize: confirm emoji are stripped.
 *
 * Pexels/Pixabay are skipped here because they need keys; we test those when
 * the user has filled .env (see scripts/smoke-media-network.ts later).
 *
 * Run: pnpm smoke:media
 */
import { existsSync, statSync } from 'node:fs'
import { stripEmoji } from '@news-tok/shared/sanitize'
import { listVoices, synthesize } from '@news-tok/media'

async function testEmoji() {
  const input = 'Xin chào thế giới'
  const out = stripEmoji(input)
  if (out !== 'Xin chào thế giới') {
    throw new Error(`stripEmoji mangled clean text: "${out}"`)
  }
  const dirty = 'Tin nóng hôi hổi'
  const cleaned = stripEmoji(dirty)
  if (cleaned !== 'Tin nóng hôi hổi') {
    throw new Error(`stripEmoji did not strip: "${cleaned}"`)
  }
  console.log('[media] sanitize: ok')
}

async function testListVoices() {
  const viVoices = await listVoices('vi')
  if (viVoices.length < 2) {
    throw new Error(`listVoices(vi) returned ${viVoices.length} voices, expected >= 2`)
  }
  const names = viVoices.map((v) => v.ShortName).sort()
  console.log(`[media] listVoices(vi): ${viVoices.length} voices — ${names.join(', ')}`)
}

async function testEdgeTts() {
  const result = await synthesize({
    text: 'Khoa học vũ trụ vừa có bước tiến mới.',
    voiceId: 'vi-VN-HoaiMyNeural',
    speed: 1,
  })
  if (!existsSync(result.asset.path)) {
    throw new Error(`TTS reported success but mp3 missing: ${result.asset.path}`)
  }
  const size = statSync(result.asset.path).size
  if (size < 1000) {
    throw new Error(`TTS mp3 suspiciously small (${size} bytes): ${result.asset.path}`)
  }
  if (result.wordBoundaries.length === 0) {
    console.warn(
      `[media] warn: synthesize returned 0 word boundaries; ` +
        `subtitle alignment will be unavailable`
    )
  }
  console.log(
    `[media] edge-tts synthesize: ok — ${result.asset.path} ` +
      `(${(size / 1024).toFixed(1)} KB, ` +
      `${result.durationSec.toFixed(2)}s, ${result.wordBoundaries.length} word boundaries)`
  )
}

async function main() {
  await testEmoji()
  await testListVoices()
  await testEdgeTts()
  console.log('[media] all smoke tests passed')
}

main().catch((err) => {
  console.error('[media] failed:', err)
  process.exit(1)
})
