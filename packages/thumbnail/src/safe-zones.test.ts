import { describe, expect, it } from 'vitest'
import {
  PLATFORM_SAFE_ZONES,
  UNIVERSAL_SAFE_ZONE,
  UNIVERSAL_GRID_SAFE_ZONE,
  THUMB_WIDTH,
  THUMB_HEIGHT,
  isInsideUniversalSafeZone,
  lintAgainstAllPlatforms,
} from './safe-zones.js'

describe('PLATFORM_SAFE_ZONES', () => {
  it('declares all four platforms', () => {
    const keys = Object.keys(PLATFORM_SAFE_ZONES).sort()
    expect(keys).toEqual(['facebook-reels', 'instagram-reels', 'tiktok', 'youtube-shorts'])
  })

  it('every unsafe rect fits inside the 1080x1920 canvas', () => {
    for (const p of Object.values(PLATFORM_SAFE_ZONES)) {
      for (const r of p.unsafe) {
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.width).toBeLessThanOrEqual(THUMB_WIDTH)
        expect(r.y + r.height).toBeLessThanOrEqual(THUMB_HEIGHT)
      }
    }
  })
})

describe('UNIVERSAL_SAFE_ZONE', () => {
  it('starts below all top UI bands', () => {
    const tops = Object.values(PLATFORM_SAFE_ZONES).map((p) =>
      Math.max(0, ...p.unsafe.filter((r) => r.y === 0).map((r) => r.height))
    )
    expect(UNIVERSAL_SAFE_ZONE.y).toBe(Math.max(...tops))
  })

  it('ends above all bottom UI bands', () => {
    const bottoms = Object.values(PLATFORM_SAFE_ZONES).map((p) =>
      Math.min(
        THUMB_HEIGHT,
        ...p.unsafe.filter((r) => r.y + r.height === THUMB_HEIGHT).map((r) => r.y)
      )
    )
    expect(UNIVERSAL_SAFE_ZONE.y + UNIVERSAL_SAFE_ZONE.height).toBe(Math.min(...bottoms))
  })

  it('resolves to a positive-area rect on real platform data', () => {
    expect(UNIVERSAL_SAFE_ZONE.width).toBeGreaterThan(0)
    expect(UNIVERSAL_SAFE_ZONE.height).toBeGreaterThan(0)
  })
})

describe('UNIVERSAL_GRID_SAFE_ZONE', () => {
  it('is non-empty (every platform grid crop overlaps in the centre)', () => {
    expect(UNIVERSAL_GRID_SAFE_ZONE.height).toBeGreaterThan(0)
    // FB has the tightest grid crop (1080x1080 centred) → universal grid
    // safe zone must fit inside FB's crop.
    const fb = PLATFORM_SAFE_ZONES['facebook-reels'].gridCrop
    expect(UNIVERSAL_GRID_SAFE_ZONE.y).toBeGreaterThanOrEqual(fb.y)
    expect(UNIVERSAL_GRID_SAFE_ZONE.y + UNIVERSAL_GRID_SAFE_ZONE.height).toBeLessThanOrEqual(
      fb.y + fb.height
    )
  })
})

describe('isInsideUniversalSafeZone', () => {
  it('returns true for a rect well inside the safe zone', () => {
    expect(
      isInsideUniversalSafeZone({ x: 100, y: 500, width: 600, height: 200 })
    ).toBe(true)
  })

  it('returns false when the rect extends into the top UI band', () => {
    expect(
      isInsideUniversalSafeZone({ x: 0, y: 100, width: 600, height: 300 })
    ).toBe(false)
  })

  it('returns false when the rect extends into the bottom UI band', () => {
    expect(
      isInsideUniversalSafeZone({ x: 0, y: 1400, width: 600, height: 200 })
    ).toBe(false)
  })
})

describe('lintAgainstAllPlatforms', () => {
  it('returns ok=true and no warnings when content is in universal safe zone', () => {
    const result = lintAgainstAllPlatforms({ x: 100, y: 500, width: 600, height: 200 })
    expect(result.ok).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('warns about every platform whose UI band the content overlaps', () => {
    // y=80 hits all 4 platforms' top UI bands (120..250 deep).
    const result = lintAgainstAllPlatforms({ x: 0, y: 80, width: 1080, height: 200 }, 'Headline')
    expect(result.ok).toBe(false)
    expect(result.warnings.length).toBeGreaterThanOrEqual(4)
    expect(result.warnings.every((w) => w.includes('Headline'))).toBe(true)
  })
})
