import { describe, expect, it } from 'vitest'
import { __test } from './peaks.js'

const { binMaxPeaks } = __test

// We avoid spawning ffmpeg here — readF32Mono is exercised end-to-end by
// scripts/smoke-media.ts. Tests below cover the pure binning math, which
// is the part most likely to silently drift if someone tunes the
// algorithm (eg. RMS instead of max).

describe('binMaxPeaks', () => {
  it('returns N buckets even when the signal is short', () => {
    const sig = new Float32Array([0.5, -0.3, 0.9, -0.1])
    const out = binMaxPeaks(sig, 8)
    expect(out).toHaveLength(8)
    // Every bucket must be in [0, 1] and the global max must be normalized to 1.
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of out) expect(v).toBeLessThanOrEqual(1)
    expect(Math.max(...out)).toBeCloseTo(1, 5)
  })

  it('finds the loud peak inside a quiet sea', () => {
    // 1000 samples, all zero except one big spike near sample 700.
    const sig = new Float32Array(1000)
    sig[700] = 0.8
    const out = binMaxPeaks(sig, 10) // 10 bins, each 100 samples wide
    // The spike is in bin index 7 (samples 700..799).
    expect(out[7]).toBeCloseTo(1, 5) // normalized to global max
    // Every other bin must be exactly 0 since the rest of the signal is silence.
    out.forEach((v, i) => {
      if (i !== 7) expect(v).toBe(0)
    })
  })

  it('uses absolute value so negative peaks count as loud (audio is signed)', () => {
    // Two equal-magnitude peaks, one positive in bin 0, one negative in bin 1.
    const sig = new Float32Array(20)
    sig[5] = 0.5 // bin 0 covers samples 0..9
    sig[15] = -0.5 // bin 1 covers samples 10..19
    const out = binMaxPeaks(sig, 2)
    expect(out[0]).toBeCloseTo(1, 5)
    expect(out[1]).toBeCloseTo(1, 5)
  })

  it('returns all zeros for an all-zero signal without divide-by-zero', () => {
    // Without the globalMax guard this would produce NaN entries —
    // those propagate into JSON.stringify as `null` and break the UI.
    const sig = new Float32Array(100)
    const out = binMaxPeaks(sig, 50)
    expect(out).toHaveLength(50)
    expect(out.every((v) => v === 0)).toBe(true)
  })

  it('returns empty array when targetSamples is 0', () => {
    expect(binMaxPeaks(new Float32Array([0.1, 0.2]), 0)).toEqual([])
  })

  it('returns N zeros when the source signal is empty', () => {
    expect(binMaxPeaks(new Float32Array(0), 4)).toEqual([0, 0, 0, 0])
  })

  it('normalizes so the tallest peak is exactly 1.0', () => {
    // Sample magnitude 0.25 should still map to 1.0 because it is the
    // loudest thing in the signal. This is what makes short / quiet
    // tracks render with a usable waveform instead of a flat line.
    const sig = new Float32Array(10)
    sig[3] = 0.25
    const out = binMaxPeaks(sig, 5)
    expect(Math.max(...out)).toBeCloseTo(1, 5)
  })
})
