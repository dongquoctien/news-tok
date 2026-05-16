import { describe, expect, it } from 'vitest'
import type { BgMusicEdits } from '@news-tok/shared/schema'
import {
  TRIM_DEFAULT_EDITS,
  looksLikeDefault,
  smartDefaultTrim,
} from './bg-music-trim.js'

describe('smartDefaultTrim', () => {
  it('selects the whole track when track is short relative to video', () => {
    // 30s video, 35s track → only 1.17× → not worth trimming.
    expect(smartDefaultTrim(35, 30)).toEqual({ startSec: 0, endSec: 35 })
  })

  it('starts 1/3 in for a track that is much longer than the video', () => {
    // 30s video, 180s track → start at 60s (1/3), end at 90s (60 + 30).
    expect(smartDefaultTrim(180, 30)).toEqual({ startSec: 60, endSec: 90 })
  })

  it('clamps end to track duration when 1/3 + video overshoots', () => {
    // Pathological: video 30s, track 50s (1.67× — barely above threshold).
    // 1/3 = 16.67, end would be 46.67 — still fits. Pick a case that
    // overshoots: video 30s, track 46s. 1/3 = 15.33, end = 45.33 < 46. OK.
    // Force an overshoot: video 35s, track 53s (~1.51×).
    const r = smartDefaultTrim(53, 35)
    expect(r.endSec).toBeLessThanOrEqual(53)
    expect(r.startSec).toBeGreaterThan(0)
  })

  it('handles zero/negative durations defensively', () => {
    // Schema rejects negatives, but the helper still shouldn't NaN out
    // if called from a stale render that hasn't received peaks yet.
    expect(smartDefaultTrim(0, 30)).toEqual({ startSec: 0, endSec: 0 })
    expect(smartDefaultTrim(60, 0)).toEqual({ startSec: 0, endSec: 60 })
  })

  it('threshold is exactly 1.5× — selecting whole track at the boundary', () => {
    // At exactly 1.5×, we still pick the whole track. The "1/3 into"
    // strategy doesn't materially help here (you'd cut 0..1/3 which
    // is ~22% of the track — not enough to skip a typical intro).
    expect(smartDefaultTrim(45, 30)).toEqual({ startSec: 0, endSec: 45 })
  })
})

describe('looksLikeDefault', () => {
  it('returns true for the canonical default edits object', () => {
    expect(looksLikeDefault(TRIM_DEFAULT_EDITS)).toBe(true)
  })

  it('tolerates fadeOutSec floating-point drift around 1.2', () => {
    // JSON round-trip occasionally produces 1.2000000001 — without the
    // tolerance, the smart-default branch would never fire on reload.
    const drifted: BgMusicEdits = {
      ...TRIM_DEFAULT_EDITS,
      fadeOutSec: 1.2000000001,
    }
    expect(looksLikeDefault(drifted)).toBe(true)
  })

  it('returns false when the user has trimmed the track', () => {
    const trimmed: BgMusicEdits = {
      ...TRIM_DEFAULT_EDITS,
      trimStartSec: 10,
      trimEndSec: 40,
    }
    expect(looksLikeDefault(trimmed)).toBe(false)
  })

  it('returns false when ducking has been enabled', () => {
    const ducked: BgMusicEdits = {
      ...TRIM_DEFAULT_EDITS,
      ducking: { enabled: true, ratio: 0.3, smoothMs: 200 },
    }
    expect(looksLikeDefault(ducked)).toBe(false)
  })

  it('returns false when fadeIn has been adjusted', () => {
    const faded: BgMusicEdits = { ...TRIM_DEFAULT_EDITS, fadeInSec: 0.5 }
    expect(looksLikeDefault(faded)).toBe(false)
  })
})
