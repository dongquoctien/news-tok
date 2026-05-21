import { describe, expect, it } from 'vitest'
import { classifyAspect, computeResponsive } from './sizing.js'

describe('classifyAspect', () => {
  it('portrait when height > width by more than 5%', () => {
    expect(classifyAspect(1080, 1920)).toBe('portrait')
  })

  it('landscape when width > height by more than 5%', () => {
    expect(classifyAspect(1920, 1080)).toBe('landscape')
  })

  it('square at exactly 1:1', () => {
    expect(classifyAspect(1080, 1080)).toBe('square')
  })

  it('square within the 5% tolerance', () => {
    expect(classifyAspect(1080, 1100)).toBe('square')
    expect(classifyAspect(1100, 1080)).toBe('square')
  })
})

describe('computeResponsive — 9:16 portrait (1080x1920)', () => {
  const r = computeResponsive(1080, 1920)

  it('kind is portrait', () => {
    expect(r.kind).toBe('portrait')
  })

  it('unit = min(w,h) / 1080', () => {
    expect(r.unit).toBe(1)
  })

  it('font = height / 1920 = 1', () => {
    expect(r.font).toBe(1)
  })

  it('safeFont(78) returns 78 (no clamp in portrait)', () => {
    expect(r.safeFont(78)).toBe(78)
  })
})

describe('computeResponsive — 1:1 square (1080x1080)', () => {
  const r = computeResponsive(1080, 1080)

  it('kind is square', () => {
    expect(r.kind).toBe('square')
  })

  it('unit = 1 (min-dim / 1080)', () => {
    expect(r.unit).toBe(1)
  })

  it('font = side / 1080 = 1 (no longer collapses to 0.5625)', () => {
    expect(r.font).toBe(1)
  })

  it('safeFont(78) = 78 * clamp(1, 0.78, 1.1) = 78', () => {
    expect(r.safeFont(78)).toBe(78)
  })
})

describe('computeResponsive — 16:9 landscape (1920x1080)', () => {
  const r = computeResponsive(1920, 1080)

  it('kind is landscape', () => {
    expect(r.kind).toBe('landscape')
  })

  it('unit = min(w,h) / 1080 = 1', () => {
    expect(r.unit).toBe(1)
  })

  it('font = height / 1080 = 1', () => {
    expect(r.font).toBe(1)
  })

  it('safeFont(78) = 78 in landscape too', () => {
    expect(r.safeFont(78)).toBe(78)
  })
})

describe('computeResponsive — safeFont clamps wild aspect ratios', () => {
  it('clamps very small font scale up to 0.78 at square', () => {
    const r = computeResponsive(540, 540)
    expect(r.font).toBeCloseTo(0.5, 5)
    expect(r.safeFont(100)).toBe(78)
  })

  it('clamps very large font scale down to 1.1 at landscape', () => {
    const r = computeResponsive(3840, 2160)
    expect(r.font).toBe(2)
    expect(r.safeFont(100)).toBeCloseTo(110, 5)
  })

  it('does NOT clamp in portrait — caller asked for raw scaling', () => {
    const r = computeResponsive(540, 960)
    expect(r.safeFont(100)).toBe(50)
  })
})
