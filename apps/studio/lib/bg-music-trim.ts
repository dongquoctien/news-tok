import type { BgMusicEdits } from '@news-tok/shared/schema'

/**
 * Pure helpers shared between the trim dialog and any future
 * orchestrator that wants to seed a sensible default trim window
 * (e.g. MCP `searchMusic` could call this to pre-fill bgMusicEdits
 * when it knows the video duration ahead of time).
 *
 * Kept in apps/studio/lib instead of @news-tok/shared because the
 * heuristic is UI-flavoured — it bakes in opinions about chorus
 * positioning that don't belong in the schema package.
 */

export const TRIM_DEFAULT_EDITS: BgMusicEdits = {
  trimStartSec: 0,
  fadeInSec: 0,
  fadeOutSec: 1.2,
  ducking: { enabled: false, ratio: 0.3, smoothMs: 200 },
}

/**
 * Pick a sensible initial selection for a freshly added music track.
 *
 * Strategy:
 *   - If the track is short enough that trimming wouldn't help
 *     (< 1.5× video duration), select the whole thing. Saves the user
 *     from having to manually drag handles to the edges.
 *   - Otherwise start 1/3 into the track and span exactly the video
 *     duration. Empirically this lands on the chorus / energetic
 *     section across pop / electronic / cinematic music — the kind
 *     of section a short-form video benefits from.
 *
 * Pure, deterministic, no side effects.
 */
export function smartDefaultTrim(
  trackDurationSec: number,
  videoDurationSec: number
): { startSec: number; endSec: number } {
  if (trackDurationSec <= 0 || videoDurationSec <= 0) {
    return { startSec: 0, endSec: trackDurationSec }
  }
  if (trackDurationSec <= videoDurationSec * 1.5) {
    return { startSec: 0, endSec: trackDurationSec }
  }
  const startSec = trackDurationSec / 3
  const endSec = Math.min(trackDurationSec, startSec + videoDurationSec)
  return { startSec, endSec }
}

/**
 * Detect whether the project's edits look like they have NEVER been
 * touched (= the schema default). Used by the trim dialog to decide
 * between "respect the user's previous trim" and "compute a smart
 * default for this new track".
 *
 * Tolerant of `fadeOutSec` floating-point drift — 1.2 saved-then-
 * parsed from JSON sometimes comes back as 1.2000000001.
 */
export function looksLikeDefault(edits: BgMusicEdits): boolean {
  return (
    edits.trimStartSec === 0 &&
    edits.trimEndSec === undefined &&
    edits.fadeInSec === 0 &&
    Math.abs(edits.fadeOutSec - 1.2) < 0.01 &&
    !edits.ducking.enabled
  )
}
