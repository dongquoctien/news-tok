/**
 * Quick verification that archive.listMusic returns the expected sorted
 * list with the prefer-length-over-target rule. Not wired into the
 * regular smoke set — invoked manually during M17.
 */
import { archive } from '@news-tok/media'

async function probe(mood: string, target: number) {
  const tracks = await archive.listMusic({ mood, durationSec: target, limit: 8 })
  console.log(`[archive-list] "${mood}" target=${target}s → ${tracks.length} candidates`)
  for (const t of tracks) {
    const dur = t.durationSec ?? 0
    const flag = dur >= target ? 'OK ' : 'SHORT'
    console.log(`  ${flag}  ${dur.toFixed(0)}s  ${t.title?.slice(0, 50) ?? t.identifier}`)
  }
  const first = tracks[0]
  if (!first || (first.durationSec ?? 0) < target) {
    console.error(
      `[archive-list] FAIL: top track ${first?.durationSec ?? 'unknown'}s < target ${target}s`
    )
    process.exit(1)
  }
  console.log()
}

async function main() {
  await probe('calm', 30)
  await probe('ambient', 60)
  await probe('news', 45)
  console.log('[archive-list] PASS — every top pick covers its target.')
}

main().catch((err) => {
  console.error('[archive-list] error:', err)
  process.exit(1)
})
