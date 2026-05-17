import { describe, expect, it } from 'vitest'
import type { Segment } from '@news-tok/shared/schema'
import { buildDuckTimeline, volumeAtFrame } from './ducking.js'

/**
 * Build a Segment fixture with just the fields the ducking math reads.
 * We deliberately avoid SegmentSchema.parse so tests stay focused on
 * the ducking algorithm rather than the surrounding schema surface.
 */
function makeSegment(
  wordBoundaries: Array<{ offsetSec: number; durationSec: number; text: string }> | undefined
): Segment {
  return {
    id: 's',
    durationSec: 5,
    scene: 'keypoint',
    text: 'x',
    voice: { provider: 'edge-tts', voiceId: 'v', speed: 1 },
    visuals: {},
    effects: [],
    wordBoundaries,
  } as unknown as Segment
}

const OPTS = {
  fps: 30,
  ratio: 0.3,
  smoothMs: 200,
  paddingSec: 0.1,
}

describe('buildDuckTimeline', () => {
  it('returns the frame-0 neutral anchor when no segments have wordBoundaries', () => {
    // The renderer's volumeAtFrame must always have a sane answer, even
    // for projects where TTS hasn't run yet — otherwise enabling
    // ducking would crash mid-render.
    const t = buildDuckTimeline([makeSegment(undefined)], {
      ...OPTS,
      segmentOffsets: [0],
    })
    expect(t.transitions).toEqual([{ frame: 0, target: 1 }])
  })

  it('emits a duck-down transition at word start and duck-up at word end', () => {
    // One word from 1.0s to 1.5s, with 0.1s padding both sides at 30fps.
    // Active interval: [0.9s, 1.6s] = [27, 48] frames.
    const seg = makeSegment([{ offsetSec: 1.0, durationSec: 0.5, text: 'hi' }])
    const t = buildDuckTimeline([seg], { ...OPTS, segmentOffsets: [0] })
    expect(t.transitions).toEqual([
      { frame: 0, target: 1 },
      { frame: 27, target: 0.3 },
      { frame: 48, target: 1 },
    ])
  })

  it('merges adjacent words into one duck region (no pumping between words)', () => {
    // Word A: offset 0.2s, dur 0.4s → with 0.1s pad, active window
    //   start = floor((0.2 - 0.1) * 30) = floor(3) = 3
    //   end   = ceil((0.2 + 0.4 + 0.1) * 30) = ceil(21) = 21
    // Word B: offset 0.65s, dur 0.5s → with 0.1s pad, active window
    //   start = floor((0.65 - 0.1) * 30) = floor(16.5) = 16
    //   end   = ceil((0.65 + 0.5 + 0.1) * 30) = ceil(37.5) = 38
    // B.start (16) <= A.end (21) → they merge into [3, 38].
    const seg = makeSegment([
      { offsetSec: 0.2, durationSec: 0.4, text: 'a' },
      { offsetSec: 0.65, durationSec: 0.5, text: 'b' },
    ])
    const t = buildDuckTimeline([seg], { ...OPTS, segmentOffsets: [0] })
    expect(t.transitions).toEqual([
      { frame: 0, target: 1 },
      { frame: 3, target: 0.3 },
      { frame: 38, target: 1 },
    ])
  })

  it('respects segment offsets when stacking segments end-to-end', () => {
    // Two segments, each 60 frames long. Both segments have a word
    // 0..0.5s. With segment offsets [0, 60], the active intervals are:
    //   Seg 0: start = max(0, floor((0 - 0.1) * 30)) = 0
    //          end   = ceil((0 + 0.5 + 0.1) * 30) = 18    → [0, 18]
    //   Seg 1: same shape relative to offset 60         → [60, 78]
    // Note that with offsetSec=0, the -0.1s padding clamps via
    // Math.max(0, ...) — so segment 1's pre-word pad does NOT start
    // at frame 57. Each segment owns its frame-0 only when it sits
    // at the start of the project.
    const segs = [
      makeSegment([{ offsetSec: 0, durationSec: 0.5, text: 'a' }]),
      makeSegment([{ offsetSec: 0, durationSec: 0.5, text: 'b' }]),
    ]
    const t = buildDuckTimeline(segs, { ...OPTS, segmentOffsets: [0, 60] })
    // Narration at absolute frame 0 → the frame-0 anchor's target
    // becomes 0.3 (not a separate duplicate entry).
    expect(t.transitions[0]).toEqual({ frame: 0, target: 0.3 })
    expect(t.transitions).toContainEqual({ frame: 18, target: 1 })
    expect(t.transitions).toContainEqual({ frame: 60, target: 0.3 })
    expect(t.transitions).toContainEqual({ frame: 78, target: 1 })
  })

  it('replaces (not duplicates) the frame-0 anchor when narration starts immediately', () => {
    // Word starts at offsetSec=0, so padding pulls back to -0.1s which
    // clamps to frame 0. We must NOT emit two entries at frame 0 —
    // otherwise the binary search in volumeAtFrame picks the wrong one.
    const seg = makeSegment([{ offsetSec: 0, durationSec: 0.5, text: 'hi' }])
    const t = buildDuckTimeline([seg], { ...OPTS, segmentOffsets: [0] })
    const atZero = t.transitions.filter((tr) => tr.frame === 0)
    expect(atZero).toHaveLength(1)
    expect(atZero[0]!.target).toBe(0.3)
  })

  it('encodes smoothFrames from smoothMs at the project fps', () => {
    const t = buildDuckTimeline([], {
      ...OPTS,
      fps: 30,
      segmentOffsets: [],
      smoothMs: 200,
    })
    expect(t.smoothFrames).toBe(6) // 200ms × 30fps = 6 frames
    const t2 = buildDuckTimeline([], {
      ...OPTS,
      fps: 60,
      segmentOffsets: [],
      smoothMs: 200,
    })
    expect(t2.smoothFrames).toBe(12) // 200ms × 60fps = 12 frames
  })
})

describe('volumeAtFrame', () => {
  const timeline = {
    transitions: [
      { frame: 0, target: 1 },
      { frame: 30, target: 0.3 },
      { frame: 60, target: 1 },
    ],
    smoothFrames: 6,
  }

  it('returns the neutral value before the first duck', () => {
    expect(volumeAtFrame(timeline, 0)).toBeCloseTo(1, 5)
    expect(volumeAtFrame(timeline, 20)).toBeCloseTo(1, 5)
  })

  it('linearly ramps down inside the smoothing window at duck-down', () => {
    // Transition fires at frame 30, smooth window = 6 frames.
    // frame 30: t=0 → still 1.0 (just starting)
    // frame 33: t=3/6 = 0.5 → 1 + (0.3-1)*0.5 = 0.65
    // frame 36: t=1.0 → fully at 0.3
    expect(volumeAtFrame(timeline, 30)).toBeCloseTo(1, 5)
    expect(volumeAtFrame(timeline, 33)).toBeCloseTo(0.65, 5)
    expect(volumeAtFrame(timeline, 36)).toBeCloseTo(0.3, 5)
  })

  it('holds the ducked value between duck-down and duck-up', () => {
    expect(volumeAtFrame(timeline, 40)).toBeCloseTo(0.3, 5)
    expect(volumeAtFrame(timeline, 55)).toBeCloseTo(0.3, 5)
  })

  it('linearly ramps back up inside the smoothing window at duck-up', () => {
    // Transition at frame 60, ramps 0.3 → 1 over 6 frames.
    expect(volumeAtFrame(timeline, 60)).toBeCloseTo(0.3, 5)
    expect(volumeAtFrame(timeline, 63)).toBeCloseTo(0.65, 5)
    expect(volumeAtFrame(timeline, 66)).toBeCloseTo(1, 5)
  })

  it('holds the final target after the last transition', () => {
    expect(volumeAtFrame(timeline, 100)).toBeCloseTo(1, 5)
    expect(volumeAtFrame(timeline, 10000)).toBeCloseTo(1, 5)
  })

  it('returns 1 for an empty timeline (defensive)', () => {
    expect(volumeAtFrame({ transitions: [], smoothFrames: 6 }, 50)).toBe(1)
  })

  it('handles the neutral-only timeline produced by no-wordBoundaries', () => {
    // buildDuckTimeline returns this when no segment has wordBoundaries.
    const t = { transitions: [{ frame: 0, target: 1 }], smoothFrames: 6 }
    expect(volumeAtFrame(t, 0)).toBe(1)
    expect(volumeAtFrame(t, 100)).toBe(1)
    expect(volumeAtFrame(t, 10000)).toBe(1)
  })

  it('does not jump on seek — value at frame N is the same regardless of access order', () => {
    // Critical: Remotion seeks anywhere. If volumeAtFrame depended on
    // hidden state, scrubbing the player would produce different
    // values for the same frame.
    const a = volumeAtFrame(timeline, 45)
    volumeAtFrame(timeline, 0)
    volumeAtFrame(timeline, 90)
    volumeAtFrame(timeline, 10)
    const b = volumeAtFrame(timeline, 45)
    expect(b).toBe(a)
  })
})
