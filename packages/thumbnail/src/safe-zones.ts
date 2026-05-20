/**
 * Safe zones per platform for a 1080x1920 (9:16) thumbnail.
 *
 * Each platform paints native UI (username, caption, like / comment / share,
 * page header) ON TOP of the cover image when the video appears in the
 * feed. Anything important (headline text, faces, logos) that falls inside
 * those bands gets obscured.
 *
 * `unsafe` = pixel rects that platform UI covers — DO NOT put readable
 * content there.
 * `gridCrop` = how the thumb gets cropped on the profile grid (most users
 * discover videos through this view, so the crop must still read well).
 *
 * Numbers below are conservative defaults from Hootsuite + platform docs
 * (May 2026 audit). They favour "slightly oversized safe margin" over
 * "tight pixel-accurate", because each platform reflows UI every few
 * months and a 30px buffer beats a redesign.
 */

export const THUMB_WIDTH = 1080
export const THUMB_HEIGHT = 1920

export type SafeZoneRect = { x: number; y: number; width: number; height: number }

export type PlatformSafeZone = {
  platform: 'tiktok' | 'youtube-shorts' | 'facebook-reels' | 'instagram-reels'
  /** Rects covered by platform UI overlay (top + bottom usually). */
  unsafe: SafeZoneRect[]
  /** Profile-grid crop region — content outside this is hidden on grid. */
  gridCrop: SafeZoneRect
}

export const PLATFORM_SAFE_ZONES: Record<PlatformSafeZone['platform'], PlatformSafeZone> = {
  tiktok: {
    platform: 'tiktok',
    unsafe: [
      // Top: username/caption overlay
      { x: 0, y: 0, width: THUMB_WIDTH, height: 150 },
      // Bottom-right column: like/comment/share/save buttons + bottom caption
      { x: 0, y: THUMB_HEIGHT - 480, width: THUMB_WIDTH, height: 480 },
    ],
    // Profile grid crop ~ 3:4 vertical, top + bottom trimmed.
    gridCrop: { x: 0, y: 240, width: THUMB_WIDTH, height: 1440 },
  },
  'youtube-shorts': {
    platform: 'youtube-shorts',
    unsafe: [
      // Top: channel handle + ellipsis menu
      { x: 0, y: 0, width: THUMB_WIDTH, height: 120 },
      // Bottom: title + like/dislike/comment/share rail
      { x: 0, y: THUMB_HEIGHT - 280, width: THUMB_WIDTH, height: 280 },
    ],
    // Shorts shelf preview crop ~ 3:4.
    gridCrop: { x: 0, y: 240, width: THUMB_WIDTH, height: 1440 },
  },
  'facebook-reels': {
    platform: 'facebook-reels',
    unsafe: [
      // Top: profile picture + page name + 3-dot menu
      { x: 0, y: 0, width: THUMB_WIDTH, height: 210 },
      // Bottom: caption + audio attribution + reaction rail
      { x: 0, y: THUMB_HEIGHT - 290, width: THUMB_WIDTH, height: 290 },
    ],
    // FB page grid crops to centred 1:1 square.
    gridCrop: { x: 0, y: 420, width: THUMB_WIDTH, height: 1080 },
  },
  'instagram-reels': {
    platform: 'instagram-reels',
    unsafe: [
      // Top: username + audio source + follow button
      { x: 0, y: 0, width: THUMB_WIDTH, height: 250 },
      // Bottom: caption + bottom nav + actions on right
      { x: 0, y: THUMB_HEIGHT - 450, width: THUMB_WIDTH, height: 450 },
    ],
    // Profile grid crop ~ 3:4 (1080x1440), top + bottom trimmed.
    gridCrop: { x: 0, y: 240, width: THUMB_WIDTH, height: 1440 },
  },
}

/**
 * Intersection of every platform's safe area — the universal "always safe"
 * box where text + faces MUST land if you only ship one thumbnail file.
 *
 * For 1080x1920 the math works out to:
 *   - top edge:    max(150, 120, 210, 250) = 250
 *   - bottom edge: 1920 - max(480, 280, 290, 450) = 1920 - 480 = 1440
 *   → y range [250, 1440], height 1190.
 *
 * Width is full 1080 because no platform paints column-wide overlays in
 * the middle band (TikTok's action rail sits inside the bottom 480px).
 */
export const UNIVERSAL_SAFE_ZONE: SafeZoneRect = (() => {
  const platforms = Object.values(PLATFORM_SAFE_ZONES)
  let topEdge = 0
  let bottomEdge = THUMB_HEIGHT
  for (const p of platforms) {
    for (const rect of p.unsafe) {
      if (rect.y === 0) {
        topEdge = Math.max(topEdge, rect.height)
      } else if (rect.y + rect.height === THUMB_HEIGHT) {
        bottomEdge = Math.min(bottomEdge, rect.y)
      }
    }
  }
  return {
    x: 0,
    y: topEdge,
    width: THUMB_WIDTH,
    height: bottomEdge - topEdge,
  }
})()

/**
 * Intersection of every platform's grid-crop rect — the centred square
 * region that survives on EVERY platform's profile grid. Use this as the
 * "must-read-at-thumbnail-size" guide for face + logo + accent placement.
 *
 * Concretely: FB crops to 1080x1080 centred (y=420..1500), so the others
 * (1080x1440 each) intersect with FB's crop and yield FB's exact square.
 */
export const UNIVERSAL_GRID_SAFE_ZONE: SafeZoneRect = (() => {
  const platforms = Object.values(PLATFORM_SAFE_ZONES)
  let topEdge = 0
  let bottomEdge = THUMB_HEIGHT
  for (const p of platforms) {
    topEdge = Math.max(topEdge, p.gridCrop.y)
    bottomEdge = Math.min(bottomEdge, p.gridCrop.y + p.gridCrop.height)
  }
  return {
    x: 0,
    y: topEdge,
    width: THUMB_WIDTH,
    height: Math.max(0, bottomEdge - topEdge),
  }
})()

// -- Geometry helpers --------------------------------------------------------

function rectsOverlap(a: SafeZoneRect, b: SafeZoneRect): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)
}

export function isInsideUniversalSafeZone(rect: SafeZoneRect): boolean {
  const sz = UNIVERSAL_SAFE_ZONE
  return (
    rect.x >= sz.x &&
    rect.y >= sz.y &&
    rect.x + rect.width <= sz.x + sz.width &&
    rect.y + rect.height <= sz.y + sz.height
  )
}

export type SafeZoneLintResult = {
  ok: boolean
  warnings: string[]
}

/**
 * Lint a content rect (text bounding box, chip, face crop) against every
 * platform safe zone. Returns an array of human-readable warnings the
 * editor can show next to the offending element. Empty array = safe
 * everywhere.
 */
export function lintAgainstAllPlatforms(rect: SafeZoneRect, label = 'Content'): SafeZoneLintResult {
  const warnings: string[] = []
  for (const p of Object.values(PLATFORM_SAFE_ZONES)) {
    for (const unsafe of p.unsafe) {
      if (rectsOverlap(rect, unsafe)) {
        const where = unsafe.y === 0 ? 'top' : 'bottom'
        warnings.push(`${label} overlaps ${p.platform} ${where} UI band (y=${unsafe.y}..${unsafe.y + unsafe.height})`)
      }
    }
  }
  return { ok: warnings.length === 0, warnings }
}

/**
 * RGBA tuple for editor overlay paint:
 *   - green: universal safe (every platform agrees)
 *   - yellow: safe on some, covered on others
 *   - red: covered on at least one platform
 *
 * The editor draws these as translucent masks on top of the canvas so
 * the user can see in one glance where the headline can go.
 */
export const SAFE_ZONE_COLORS = {
  universal: 'rgba(34,197,94,0.18)',
  partial: 'rgba(234,179,8,0.18)',
  unsafe: 'rgba(239,68,68,0.28)',
  outline: {
    universal: 'rgba(34,197,94,0.9)',
    partial: 'rgba(234,179,8,0.9)',
    unsafe: 'rgba(239,68,68,0.9)',
  },
} as const
