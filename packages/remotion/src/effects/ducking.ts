/**
 * Sidechain ducking timeline for background music.
 *
 * "Ducking" is the broadcast technique of automatically lowering the
 * music bed while voice-over is speaking — the music "ducks under" the
 * voice. Done well, viewers don't consciously notice it; done badly
 * (too fast, too deep) it audibly "pumps" between segments.
 *
 * Inputs come from `segment.wordBoundaries` (which Edge TTS already
 * gives us — see media/src/edge-tts.ts). No extra signal extraction
 * needed.
 *
 * The interesting design constraint: Remotion renders each frame
 * STANDALONE. There's no React state carried between frames inside a
 * <Composition>. So the smoothed volume curve has to be computable
 * from a single frame index — not a running EMA. The implementation
 * here precomputes a sparse list of transition frames + targets, and
 * at render time `volumeAtFrame` does a binary search + analytical
 * lerp from the last transition. That keeps per-frame cost O(log N)
 * and gives Remotion the seek-anywhere determinism it needs.
 */
import type { Segment } from '@news-tok/shared/schema'

/**
 * A precomputed point on the volume curve. Between two consecutive
 * points, the curve linearly interpolates from `prev.target` to
 * `next.target` over `smoothFrames`. The first point starts at the
 * neutral (non-ducked) value, so a video that opens with narration
 * will start fading down from 1.0 instead of jumping to the duck
 * level mid-fade-in.
 */
type DuckTransition = {
  /** Frame index where the target changes. */
  frame: number
  /** 1 = neutral (full music), 0..1 = ducked. */
  target: number
}

export type DuckTimeline = {
  /** Sorted by frame ascending. First entry always at frame 0. */
  transitions: DuckTransition[]
  /** Smoothing window in frames, derived from edits.ducking.smoothMs. */
  smoothFrames: number
}

export type BuildDuckTimelineOptions = {
  fps: number
  /**
   * Per-segment offset in frames — the timeline is composed of stacked
   * segments, and `wordBoundaries` are relative to each segment's own
   * narration. We need the project-wide offset to align them with the
   * music timeline.
   */
  segmentOffsets: number[]
  /** Volume multiplier while narration is active, 0..1. */
  ratio: number
  /** Attack/release window in milliseconds. */
  smoothMs: number
  /**
   * Extra padding before/after each word boundary, in seconds. Without
   * this the duck pops back to full volume in the 50ms gap between
   * words, producing audible pumping. 100ms is broadcast-standard.
   */
  paddingSec?: number
}

/**
 * Build a duck timeline from a project's segments. Pure / deterministic —
 * tests feed in synthetic wordBoundaries.
 *
 * Algorithm:
 *   1. For every word in every segment, mark `[wordStart - pad,
 *      wordEnd + pad]` as "narration active".
 *   2. Merge overlapping intervals (a fast word run inside one
 *      segment, or two adjacent segments with no gap).
 *   3. Emit transitions: at the start of each active interval, target
 *      becomes `ratio`; at the end, target becomes 1. Skip emitting
 *      a transition if it doesn't actually change the target — keeps
 *      the timeline minimal for short-narration projects.
 *
 * If no segments have wordBoundaries, returns an empty timeline (just
 * `[{frame: 0, target: 1}]`) so the renderer's `volumeAtFrame` call
 * still returns 1 without branching.
 */
export function buildDuckTimeline(
  segments: Segment[],
  opts: BuildDuckTimelineOptions
): DuckTimeline {
  const { fps, segmentOffsets, ratio, smoothMs, paddingSec = 0.1 } = opts
  const smoothFrames = Math.max(1, Math.round((smoothMs / 1000) * fps))

  // Phase 1: collect every active interval in absolute frames.
  const intervals: Array<[number, number]> = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const segOffset = segmentOffsets[i] ?? 0
    const boundaries = seg.wordBoundaries
    if (!boundaries || boundaries.length === 0) continue
    for (const wb of boundaries) {
      const startSec = Math.max(0, wb.offsetSec - paddingSec)
      const endSec = wb.offsetSec + wb.durationSec + paddingSec
      intervals.push([
        segOffset + Math.floor(startSec * fps),
        segOffset + Math.ceil(endSec * fps),
      ])
    }
  }

  if (intervals.length === 0) {
    return { transitions: [{ frame: 0, target: 1 }], smoothFrames }
  }

  // Phase 2: sort + merge overlapping intervals.
  intervals.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  let curr = intervals[0]!
  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i]!
    if (next[0] <= curr[1]) {
      curr = [curr[0], Math.max(curr[1], next[1])]
    } else {
      merged.push(curr)
      curr = next
    }
  }
  merged.push(curr)

  // Phase 3: emit transitions. We always emit a synthetic frame-0
  // anchor at target=1 so `volumeAtFrame(0)` is well-defined even when
  // narration starts immediately.
  const transitions: DuckTransition[] = [{ frame: 0, target: 1 }]
  for (const [start, end] of merged) {
    if (start > 0) {
      transitions.push({ frame: start, target: ratio })
    } else {
      // Narration starts at frame 0 — replace the anchor instead of
      // emitting a duplicate at the same frame.
      transitions[0]!.target = ratio
    }
    transitions.push({ frame: end, target: 1 })
  }

  return { transitions, smoothFrames }
}

/**
 * Look up the smoothed volume multiplier at a given frame.
 *
 * Strategy: find the most recent transition that has fired by `frame`,
 * then linearly interpolate from the PREVIOUS transition's target
 * toward this one's target over `smoothFrames`. After the smoothing
 * window has elapsed, the volume sits exactly at the current target
 * until the next transition fires.
 *
 * Worst-case cost: O(log N) for the binary search where N is the
 * number of transitions. A 30-second project with 100 words → ~20
 * transitions → 4-5 comparisons per frame. Negligible.
 *
 * Returns 1 if the timeline has no transitions at all (defensive —
 * `buildDuckTimeline` always emits at least the frame-0 anchor).
 */
export function volumeAtFrame(timeline: DuckTimeline, frame: number): number {
  const { transitions, smoothFrames } = timeline
  if (transitions.length === 0) return 1

  // Binary search for the largest index whose frame <= input.
  let lo = 0
  let hi = transitions.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (transitions[mid]!.frame <= frame) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  const curr = transitions[lo]!
  const prev = lo > 0 ? transitions[lo - 1]! : { frame: -smoothFrames, target: curr.target }

  // How far through the smoothing window are we?
  const elapsed = frame - curr.frame
  if (elapsed >= smoothFrames) return curr.target

  const t = elapsed / smoothFrames
  return prev.target + (curr.target - prev.target) * t
}

// Re-export for tests that want to peek at internals (intentionally
// minimal — kept here rather than spread across the module).
export const __test = { buildDuckTimeline, volumeAtFrame }
