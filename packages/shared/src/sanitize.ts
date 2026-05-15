import emojiRegex from 'emoji-regex'
import type { AssetRef, Project, Segment } from './schema.js'

/**
 * Tiny absolute-path predicate that doesn't import `node:path`. Webpack
 * refuses to bundle `node:*` modules into client bundles in Next 14
 * even when the function never runs in the browser, so importing
 * `node:path` from sanitize.ts breaks `import { stripEmoji } from
 * '@news-tok/shared/sanitize'` in any client component. The regex
 * matches the same shape `path.isAbsolute` does on Windows + POSIX.
 */
function isAbsolutePathLike(p: string): boolean {
  return /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p)
}

/**
 * Inline copy of the relativiser from `@news-tok/shared/paths` —
 * importing the real one pulls `node:url` + `node:path` into the
 * dependency graph, which webpack refuses to bundle for client code.
 * Sanitize.ts is the only consumer that needs this in its hot path,
 * so we duplicate ~10 lines instead of fragmenting the module graph.
 *
 * The DATA_DIR prefix is recomputed on every call so we don't have to
 * share state with paths.ts; the cost is one regex + one toLowerCase
 * per AssetRef, which is negligible at storyboard scale (≤30 refs).
 */
function toRelativeDataPathInline(p: string, dataDirAbs: string): string {
  if (!p) return p
  if (!isAbsolutePathLike(p)) return p
  const normalized = p.replace(/\\/g, '/')
  const dataPrefix = dataDirAbs.replace(/\\/g, '/') + '/'
  if (normalized.toLowerCase().startsWith(dataPrefix.toLowerCase())) {
    return normalized.slice(dataPrefix.length)
  }
  return p
}

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
// --- Asset path normalisation -------------------------------------------

export type AssetPathNormalizeResult = {
  project: Project
  /** Number of AssetRef.path fields that were rewritten. */
  converted: number
}

/**
 * Rewrite every AssetRef.path in a project from its absolute form to
 * the new relative-to-`data/` form. Tolerates already-relative paths
 * (no-op) and paths that aren't under `data/` at all (leaves them as
 * the absolute form so foreign uploads outside the cache aren't
 * silently broken).
 *
 * Walks every place an AssetRef can live in `ProjectSchema`:
 *   - segment.visuals.background
 *   - segment.visuals.foreground[]
 *   - segment.audio.narration
 *   - segment.audio.sfx[]
 *   - bgMusic
 *   - library[]
 *   - customSfx[].path (string, not AssetRef but stored under data/)
 *   - logo.path (when kind === 'image')
 *
 * This is part of the sanitisation chain that runs on every write so
 * old absolute-form storyboards get migrated lazily the first time
 * they pass through Studio PATCH or MCP updateStoryboard. The
 * `scripts/migrate-paths.ts` one-shot does the same in bulk for users
 * who want all projects updated immediately.
 */
export function normalizeAssetPaths(
  p: Project,
  /**
   * Absolute path to the `data/` directory used to detect "is this
   * AssetRef under data/?". Defaults to `process.cwd()/data` so
   * server callers can call `normalizeAssetPaths(p)` without
   * threading the directory through. Tests + scripts that need a
   * specific root pass it explicitly.
   *
   * Optional so the function stays callable without importing the
   * server-only `paths` module — see comments above
   * `toRelativeDataPathInline` for why this matters.
   */
  dataDirAbs?: string
): AssetPathNormalizeResult {
  let converted = 0
  const dataDir =
    dataDirAbs ??
    (typeof process !== 'undefined' && process.cwd
      ? `${process.cwd()}/data`
      : '/data')

  const fixAsset = <T extends AssetRef | undefined>(asset: T): T => {
    if (!asset) return asset
    const next = toRelativeDataPathInline(asset.path, dataDir)
    if (next === asset.path) return asset
    converted += 1
    return { ...asset, path: next } as T
  }

  const fixAssetArray = (arr: AssetRef[] | undefined): AssetRef[] | undefined => {
    if (!arr) return arr
    let mutated = false
    const out = arr.map((a) => {
      const next = fixAsset(a)
      if (next !== a) mutated = true
      return next!
    })
    return mutated ? out : arr
  }

  const fixString = (s: string | undefined): string | undefined => {
    if (!s) return s
    const next = toRelativeDataPathInline(s, dataDir)
    if (next === s) return s
    converted += 1
    return next
  }

  let segmentsMutated = false
  const segments = p.segments.map((seg): Segment => {
    const fixedBg = fixAsset(seg.visuals.background)
    const fixedFg = fixAssetArray(seg.visuals.foreground)
    const fixedNarration = fixAsset(seg.audio?.narration)
    const fixedSfx = fixAssetArray(seg.audio?.sfx)

    const visualsChanged =
      fixedBg !== seg.visuals.background || fixedFg !== seg.visuals.foreground
    const audioChanged =
      fixedNarration !== seg.audio?.narration || fixedSfx !== seg.audio?.sfx
    if (!visualsChanged && !audioChanged) return seg

    segmentsMutated = true
    const visuals = visualsChanged
      ? { ...seg.visuals, background: fixedBg, foreground: fixedFg }
      : seg.visuals
    const audio = audioChanged
      ? { ...(seg.audio ?? {}), narration: fixedNarration, sfx: fixedSfx }
      : seg.audio
    return { ...seg, visuals, audio }
  })

  const bgMusic = fixAsset(p.bgMusic)
  const library = fixAssetArray(p.library) ?? p.library

  // customSfx entries store a raw string path (not AssetRef shape) plus
  // metadata. Still part of the same data/ tree so worth normalising.
  let customSfxMutated = false
  const customSfx = p.customSfx.map((entry) => {
    const next = fixString(entry.path)
    if (next === entry.path) return entry
    customSfxMutated = true
    return { ...entry, path: next! }
  })

  // logo only has a path when kind === 'image'.
  let logo = p.logo
  if (p.logo.kind === 'image') {
    const next = fixString(p.logo.path)
    if (next !== p.logo.path) {
      logo = { ...p.logo, path: next! }
    }
  }

  if (
    !segmentsMutated &&
    bgMusic === p.bgMusic &&
    library === p.library &&
    !customSfxMutated &&
    logo === p.logo
  ) {
    return { project: p, converted: 0 }
  }

  return {
    project: {
      ...p,
      segments: segmentsMutated ? segments : p.segments,
      bgMusic,
      library,
      customSfx: customSfxMutated ? customSfx : p.customSfx,
      logo,
    },
    converted,
  }
}

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
