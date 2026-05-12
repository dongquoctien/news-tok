import emojiRegex from 'emoji-regex'
import type { Project, Segment } from './schema.js'

const EMOJI_RE = emojiRegex()

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim()
}

export function hasEmoji(text: string): boolean {
  EMOJI_RE.lastIndex = 0
  return EMOJI_RE.test(text)
}

// --- Narration / segment duration fit ----------------------------------

export type FitOptions = {
  /**
   * Buffer added to narration duration so the audio doesn't bump the cut.
   * Default 0.4s — long enough to feel like a natural breath, short enough
   * not to inflate the video length noticeably.
   */
  trailingPaddingSec?: number
  /** Don't shrink a segment below its planned duration. Default true. */
  preserveMinPlannedSec?: boolean
}

export type SegmentDurationAdjustment = {
  segmentId: string
  plannedSec: number
  narrationSec: number
  finalSec: number
}

export type FitResult = {
  project: Project
  adjustments: SegmentDurationAdjustment[]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function narrationDuration(seg: Segment): number {
  const explicit = seg.audio?.narration?.durationSec
  if (typeof explicit === 'number' && explicit > 0) return explicit
  const last = seg.wordBoundaries?.[seg.wordBoundaries.length - 1]
  if (last) return last.offsetSec + last.durationSec
  return 0
}

/**
 * Walk a project and stretch any `segment.durationSec` that is shorter than
 * its narration audio. Pure function — returns a new project; the input is
 * not mutated. The orchestrator and the Studio API both call this so the
 * storyboard's durations always match what the renderer will actually play.
 *
 * When `preserveMinPlannedSec` is true (default) a segment is never shrunk
 * below the originally-planned duration even if the narration is shorter —
 * users may have left intentional breathing room for a visual.
 */
export function fitSegmentDurations(p: Project, opts?: FitOptions): FitResult {
  const padding = opts?.trailingPaddingSec ?? 0.4
  const preserveMin = opts?.preserveMinPlannedSec ?? true

  const adjustments: SegmentDurationAdjustment[] = []
  const segments = p.segments.map((seg) => {
    const narrationSec = narrationDuration(seg)
    if (narrationSec <= 0) return seg
    const planned = seg.durationSec
    const needed = narrationSec + padding
    const finalSec = preserveMin ? Math.max(planned, needed) : needed
    if (Math.abs(finalSec - planned) < 0.05) return seg
    adjustments.push({
      segmentId: seg.id,
      plannedSec: round1(planned),
      narrationSec: round1(narrationSec),
      finalSec: round1(finalSec),
    })
    return { ...seg, durationSec: round1(finalSec) }
  })

  if (!adjustments.length) return { project: p, adjustments: [] }
  return { project: { ...p, segments }, adjustments }
}

/**
 * Convenience: return only the recommended `durationSec` for a single
 * narration length, applying the same padding rule. Used by the MCP
 * `synthesizeVoice` tool to hint the orchestrator with one number.
 */
export function recommendSegmentDurationSec(
  narrationSec: number,
  plannedSec?: number,
  opts?: FitOptions
): number {
  const padding = opts?.trailingPaddingSec ?? 0.4
  const preserveMin = opts?.preserveMinPlannedSec ?? true
  const needed = narrationSec + padding
  if (typeof plannedSec === 'number' && preserveMin) {
    return round1(Math.max(plannedSec, needed))
  }
  return round1(needed)
}
