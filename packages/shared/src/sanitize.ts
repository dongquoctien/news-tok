import emojiRegex from 'emoji-regex'
import type { AssetRef, Project, Segment } from './schema.js'

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

// --- Scene name normalisation -------------------------------------------

/**
 * Map common PascalCase typos back to the lowercase scene kinds the
 * renderer registers. AI orchestrators sometimes read the component
 * filenames in `packages/remotion/src/scenes/` and assume those are
 * scene values; this table catches the obvious cases so the bug never
 * lands on disk.
 *
 * Keys are case-folded; values are the canonical kind. If a name maps
 * to itself after `toLowerCase()`, it's already correct and we leave
 * it alone (`normalizeSceneNames` short-circuits that path).
 */
const SCENE_NAME_MAP: Record<string, string> = {
  titlecard: 'title',
  keypoint: 'keypoint',
  outro: 'outro',
  quote: 'quote',
  missingscene: 'title',
  title: 'title',
}

export type SceneNameAdjustment = {
  segmentId: string
  before: string
  after: string
}

export type NormalizeScenesResult = {
  project: Project
  adjustments: SceneNameAdjustment[]
}

/**
 * Normalize every segment's `scene` field. Lowercases first, then maps
 * known PascalCase component names back to their canonical kinds. A
 * name that doesn't appear in `SCENE_NAME_MAP` is left as the
 * lowercased original — that's still potentially a custom scene
 * filename, which the caller's validator can decide whether to accept.
 *
 * Pure function. Returns the new project plus a log of mutations so
 * MCP / Studio can tell the user what changed.
 */
// --- Library reconciliation ---------------------------------------------

export type LibraryReconcileResult = {
  project: Project
  /** Library entries added because a segment uses them but they weren't already listed. */
  added: number
  /** Duplicate library entries (same `path`) collapsed. */
  deduped: number
}

/**
 * Reconcile `project.library` with what the project actually uses:
 *   1. Mirror every `segment.visuals.background` (and any foreground
 *      images) into the library so the Studio Library tab reflects
 *      "all media currently in this project" — regardless of whether
 *      the asset came from `searchImage` (stock), `extractArticle`
 *      (article photo seeded by the orchestrator), or a manual user
 *      upload.
 *   2. Collapse duplicate library entries by `AssetRef.path`.
 *
 * Pure function, idempotent. Library entries the orchestrator already
 * seeded (article media that the user hasn't applied to any segment
 * yet) survive: step 1 is additive, never removing.
 */
export function reconcileLibrary(p: Project): LibraryReconcileResult {
  const existing = p.library ?? []
  const seen = new Set<string>()
  const out: AssetRef[] = []
  let deduped = 0

  // Phase 1: dedupe existing entries first so the original order is
  // preserved (article-seeded entries usually come first; stock that
  // a segment uses lands at the tail).
  for (const a of existing) {
    if (seen.has(a.path)) {
      deduped += 1
      continue
    }
    seen.add(a.path)
    out.push(a)
  }

  // Phase 2: walk segments, append anything not already in the library.
  let added = 0
  const collect = (asset: AssetRef | undefined) => {
    if (!asset) return
    if (asset.kind !== 'image') return // library is image-only for now
    if (seen.has(asset.path)) return
    seen.add(asset.path)
    out.push(asset)
    added += 1
  }
  for (const seg of p.segments) {
    collect(seg.visuals.background)
    if (seg.visuals.foreground) {
      for (const fg of seg.visuals.foreground) collect(fg)
    }
  }

  if (added === 0 && deduped === 0) {
    return { project: p, added: 0, deduped: 0 }
  }
  return {
    project: { ...p, library: out },
    added,
    deduped,
  }
}

export function normalizeSceneNames(p: Project): NormalizeScenesResult {
  const adjustments: SceneNameAdjustment[] = []
  const segments = p.segments.map((seg) => {
    const before = String(seg.scene)
    const lower = before.toLowerCase()
    const mapped = SCENE_NAME_MAP[lower] ?? lower
    if (mapped === before) return seg
    adjustments.push({ segmentId: seg.id, before, after: mapped })
    return { ...seg, scene: mapped }
  })
  if (!adjustments.length) return { project: p, adjustments: [] }
  return { project: { ...p, segments }, adjustments }
}
