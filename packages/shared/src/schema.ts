import { z } from 'zod'

export const LanguageSchema = z.enum(['vi', 'en'])
export type Language = z.infer<typeof LanguageSchema>

export const AspectSchema = z.enum(['9:16', '16:9', '1:1'])
export type Aspect = z.infer<typeof AspectSchema>

export const SceneKindSchema = z.union([
  z.enum(['title', 'keypoint', 'quote', 'outro']),
  z.string().min(1),
])
export type SceneKind = z.infer<typeof SceneKindSchema>

export const AssetRefSchema = z.object({
  kind: z.enum(['image', 'video', 'audio']),
  path: z.string(),
  source: z.object({
    provider: z.enum([
      'pexels',
      'pixabay',
      'unsplash',
      'openverse',
      'wikimedia',
      'archive',
      'jamendo',
      'freesound',
      'edge-tts',
      'local',
      'fma',
      'crawl',
    ]),
    id: z.string().optional(),
    url: z.string().url().optional(),
    attribution: z.string().optional(),
  }),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().positive().optional(),
})
export type AssetRef = z.infer<typeof AssetRefSchema>

export const EffectSpecSchema = z.object({
  kind: z.enum(['kenBurns', 'typewriter', 'fade', 'slide', 'zoom']),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
})
export type EffectSpec = z.infer<typeof EffectSpecSchema>

export const VoiceSpecSchema = z.object({
  provider: z.literal('edge-tts'),
  voiceId: z.string(),
  speed: z.number().min(0.5).max(2).default(1),
})
export type VoiceSpec = z.infer<typeof VoiceSpecSchema>

export const SourceSchema = z.object({
  type: z.enum(['text', 'url', 'file']),
  value: z.string(),
})
export type Source = z.infer<typeof SourceSchema>

export const WordBoundarySchema = z.object({
  offsetSec: z.number(),
  durationSec: z.number(),
  text: z.string(),
})
export type WordBoundary = z.infer<typeof WordBoundarySchema>

// --- Text style library --------------------------------------------------

/**
 * Motion primitive used to enter / exit a text block. Each value maps to
 * a component under `packages/remotion/src/effects/text/`. `none` renders
 * the text statically.
 */
export const TextMotionSchema = z.enum([
  'none',
  'fade',
  'slideUp',
  'slideDown',
  'scaleIn',
  'typewriter',
  'wordPop',
  'wordHighlight',
  'gradientWipe',
  'slotMachine',
  // CSS-keyframe ports, frame-driven (Remotion-safe equivalents).
  'blurReveal',
  'glitch',
  'wordReveal3d',
  'waveBounce',
  'maskWipe',
  // Sprint-1 additions — sync per-word with Edge TTS wordBoundaries
  // (karaoke) and per-letter intros for title segments (letterStagger).
  'karaoke',
  'letterStagger',
  // animate.css-flavoured ports — same family of "joyful" motions
  // but recomputed frame-by-frame so they stay deterministic under
  // Remotion's seek-anywhere render. Each maps to its own primitive
  // under packages/remotion/src/effects/text/.
  'bounceIn',
  'rubberBand',
  'flipInX',
  'lightSpeedIn',
  'rollIn',
  'tada',
  'jello',
])
export type TextMotion = z.infer<typeof TextMotionSchema>

/** Optional plate rendered behind the text. */
export const TextBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('solid'),
    color: z.string(),
    paddingPct: z.number().default(2),
    radiusPx: z.number().default(8),
    opacity: z.number().min(0).max(1).default(1),
  }),
  z.object({
    kind: z.literal('gradient'),
    from: z.string(),
    to: z.string(),
    angleDeg: z.number().default(180),
    paddingPct: z.number().default(2),
    radiusPx: z.number().default(8),
  }),
])
export type TextBackground = z.infer<typeof TextBackgroundSchema>

/**
 * Short SFX cue tied to a text style. The renderer triggers `enterSoundId`
 * at the start of the segment; `perWordSoundId` fires once per word using
 * `Segment.wordBoundaries`. Both reference ids in
 * `packages/shared/src/sfx.ts`.
 */
export const TextSfxSchema = z.object({
  enterSoundId: z.string().optional(),
  enterVolume: z.number().min(0).max(1).default(0.6),
  perWordSoundId: z.string().optional(),
  perWordVolume: z.number().min(0).max(1).default(0.4),
})
export type TextSfx = z.infer<typeof TextSfxSchema>

export const TextStyleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  family: z.enum(['news', 'social', 'cinematic', 'retro', 'playful']),
  // Typography
  fontFamily: z.string(),
  fontSize: z.number().int().positive(), // logical px @ 1080w; scaled by useResponsive
  fontWeight: z.number().int().default(700),
  letterSpacing: z.number().default(0),
  lineHeight: z.number().default(1.15),
  color: z.string(),
  // Decorators
  background: TextBackgroundSchema.default({ kind: 'none' }),
  textStroke: z
    .object({
      widthPx: z.number(),
      color: z.string(),
      // 'outside' (default) — classic webkit-text-stroke, grows beyond the
      //   glyph outline. Good for cartoony, comic-style headlines.
      // 'inside' — the stroke is painted INSIDE the glyph, eating into
      //   the fill. Implemented by inverting the paint order so the
      //   fill is drawn on top of the stroke; needs a thicker line to
      //   stay visible.
      // 'center' — half outside / half inside. CSS's native rendering.
      side: z.enum(['outside', 'inside', 'center']).optional(),
    })
    .optional(),
  textShadow: z
    .object({
      blur: z.number(),
      color: z.string(),
      offsetX: z.number().default(0),
      offsetY: z.number().default(0),
      // Optional second shadow layer for RGB-split / glitch presets.
      secondary: z
        .object({ blur: z.number(), color: z.string(), offsetX: z.number(), offsetY: z.number() })
        .optional(),
    })
    .optional(),
  /** Gradient text fill (sets `background-clip: text`). */
  gradientFill: z
    .object({ from: z.string(), to: z.string(), angleDeg: z.number().default(180) })
    .optional(),
  // Layout (relative to the 9:16 canvas; renderer adapts to 16:9 / 1:1)
  align: z.enum(['left', 'center', 'right']).default('center'),
  anchor: z.enum(['top', 'middle', 'bottom']).default('bottom'),
  marginPct: z.number().min(0).max(40).default(8),
  // Motion
  enter: TextMotionSchema.default('fade'),
  exit: z.enum(['fade', 'slideDown', 'none']).default('fade'),
  enterDurationSec: z.number().default(0.4),
  exitDurationSec: z.number().default(0.4),
  // Karaoke-specific. Active when enter='karaoke'. Falls back to 'fill'
  // when omitted; accent defaults to the style's main color.
  karaokeMode: z.enum(['fill', 'pop', 'underline']).optional(),
  karaokeAccentColor: z.string().optional(),
  /** Inactive-word color before its boundary fires (karaoke only). */
  karaokeIdleColor: z.string().optional(),
  // Letter-stagger-specific. Active when enter='letterStagger'. Default
  // 0.04s feels snappy at 30fps without dragging on long titles.
  staggerStep: z.number().optional(),
  // Sound
  sfx: TextSfxSchema.optional(),
  // Provenance
  source: z.enum(['builtin', 'user']).default('builtin'),
  /** Restrict suggestions to specific scene kinds; empty = any scene. */
  scope: z.array(SceneKindSchema).default([]),
})
export type TextStyle = z.infer<typeof TextStyleSchema>

/**
 * Per-segment color overrides — drop-in replacement for individual
 * fields on the resolved TextStyle at render time. Every field is
 * optional so users can override one color (e.g. just `accent` on a
 * karaoke preset) without redefining the whole palette.
 *
 *   - primary  → TextStyle.color (the main body fill)
 *   - accent   → TextStyle.karaokeAccentColor (active-word color)
 *   - idle     → TextStyle.karaokeIdleColor (yet-to-be-spoken color)
 *   - stroke   → TextStyle.textStroke.color (keeps existing stroke width)
 */
export const ColorOverrideSchema = z.object({
  primary: z.string().optional(),
  accent: z.string().optional(),
  idle: z.string().optional(),
  stroke: z.string().optional(),
})
export type ColorOverride = z.infer<typeof ColorOverrideSchema>

/**
 * Non-destructive image edits applied to a segment's background photo.
 * The original file under `library/` or the cache stays untouched —
 * the renderer composes these as CSS `transform`, `clip-path`, and
 * overlay layers at draw time. That keeps editing instant in the
 * Studio preview, makes the same library image reusable across
 * segments with different crops, and avoids pulling in a server-side
 * image-processing library.
 *
 * Coordinates are 0..100 percents so they survive the 1080w → 1920w
 * scaling the renderer does for different aspect presets.
 */
export const BackgroundEditsSchema = z.object({
  /**
   * Optional rectangular crop. Origin is the image's own top-left.
   * Width/height are in % of the source image; an absent field keeps
   * the full image.
   */
  crop: z
    .object({
      xPct: z.number().min(0).max(100),
      yPct: z.number().min(0).max(100),
      widthPct: z.number().min(1).max(100),
      heightPct: z.number().min(1).max(100),
    })
    .optional(),
  /** Free-angle rotation in degrees (-180..180). Default 0. */
  rotateDeg: z.number().min(-180).max(180).default(0),
  /** Mirror horizontally — useful when the subject faces the wrong way. */
  flipH: z.boolean().default(false),
  /** Mirror vertically — rarely needed but cheap to support. */
  flipV: z.boolean().default(false),
  /**
   * Radial darken intensity, 0..1. 0 = no vignette; 1 = corners are
   * pure black. Big legibility win for white-on-photo headlines.
   */
  vignette: z.number().min(0).max(1).default(0),
  /**
   * Solid color overlay — most common use is a 30% black plate to
   * push back a busy background. Blend modes are restricted to the
   * handful that are predictable across browsers and Remotion's
   * Chromium renderer.
   */
  overlay: z
    .object({
      color: z.string(),
      opacity: z.number().min(0).max(1).default(0.4),
      blendMode: z
        .enum(['normal', 'multiply', 'screen', 'overlay', 'soft-light'])
        .default('normal'),
    })
    .optional(),
})
export type BackgroundEdits = z.infer<typeof BackgroundEditsSchema>

export const SegmentSchema = z.object({
  id: z.string().min(1),
  durationSec: z.number().positive(),
  scene: SceneKindSchema,
  text: z.string(),
  voice: VoiceSpecSchema,
  visuals: z.object({
    background: AssetRefSchema.optional(),
    foreground: z.array(AssetRefSchema).optional(),
  }),
  /**
   * Optional non-destructive edits applied to `visuals.background` at
   * render time (crop / rotate / flip / vignette / overlay). Stored
   * on the segment rather than the AssetRef so the same library
   * image can be cropped differently across two segments.
   */
  backgroundEdits: BackgroundEditsSchema.optional(),
  /**
   * Optional trim window applied when `visuals.background.kind === 'video'`.
   * Stored on the segment so the same library clip can be trimmed
   * differently across segments. The renderer wraps the trimmed clip in
   * `<Loop>` so segments longer than `(endSec - startSec)` repeat the
   * trimmed window. Ignored entirely when the background is an image.
   */
  videoTrim: z
    .object({
      startSec: z.number().min(0).default(0),
      endSec: z.number().min(0).optional(),
    })
    .optional(),
  /**
   * Fade-in duration in seconds, anchored to the START of the segment.
   * Renders as a black overlay that goes from opacity 1 → 0 over the
   * first `fadeInSec` seconds of the segment. Applies to BOTH image and
   * video backgrounds so transitions between cuts feel cinematic
   * regardless of the source media.
   *
   * Absent / undefined = no fade-in (legacy behavior). Cap 2s — longer
   * fades on a 5s segment eat too much of the content.
   */
  fadeInSec: z.number().min(0).max(2).optional(),
  /**
   * Fade-out duration in seconds, anchored to the END of the segment.
   * Mirrors `fadeInSec`: black overlay opacity 0 → 1 over the last
   * `fadeOutSec` seconds.
   */
  fadeOutSec: z.number().min(0).max(2).optional(),
  /**
   * Loop the trimmed video clip when the segment is longer than the clip.
   * Renderer treats absent as `true` to preserve phase-1 behavior (always
   * loop when a clip is shorter than the segment). Set `false` to play
   * the clip once and freeze on the final frame.
   *
   * Stored as optional so a fresh `{ scene, text, voice, visuals }`
   * object literal still parses without naming every video knob; render
   * code applies `?? true` at the point of use.
   *
   * Ignored when `visuals.background.kind !== 'video'`.
   */
  videoLoop: z.boolean().optional(),
  /**
   * Mute the source audio of the background video clip. Absent = `true`
   * (silent) to keep narration TTS clean for the common news-b-roll
   * case. Set `false` for interview clips where the on-camera audio
   * matters; the renderer drops this segment's narration when this is
   * explicitly `false`.
   */
  videoMuted: z.boolean().optional(),
  /**
   * Volume multiplier (0..1) applied when `videoMuted === false`. Ignored
   * otherwise. Absent = 1. The narration auto-mute rule does NOT consult
   * this field — any explicit unmute (regardless of volume) drops
   * narration so a "mute with volume 0" mistake can't leak both tracks.
   */
  videoVolume: z.number().min(0).max(1).optional(),
  /**
   * Playback rate for the background video. Absent = 1 (normal speed).
   * Clamped to [0.25, 2] to keep the pitch shift (when unmuted) within
   * the range Remotion's <OffthreadVideo> handles cleanly.
   */
  videoPlaybackRate: z.number().min(0.25).max(2).optional(),
  /**
   * CSS object-fit equivalent for the background video. Absent = `cover`
   * (phase-1 behavior). `contain` letterboxes the clip inside the
   * segment, making `videoAlign` load-bearing. `fill` stretches the
   * clip to the segment aspect.
   */
  videoFit: z.enum(['cover', 'contain', 'fill']).optional(),
  /**
   * Nine-position align grid that controls `objectPosition` when the
   * clip doesn't fill the segment frame. Absent = `center`. Only
   * meaningful when `videoFit === 'contain'` — `cover` and `fill`
   * always occupy the full frame.
   */
  videoAlign: z
    .enum([
      'top-left',
      'top-center',
      'top-right',
      'center-left',
      'center',
      'center-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ])
    .optional(),
  effects: z.array(EffectSpecSchema).default([]),
  audio: z
    .object({
      narration: AssetRefSchema.optional(),
      sfx: z.array(AssetRefSchema).optional(),
    })
    .optional(),
  /** Per-word timing produced by Edge TTS for subtitle alignment. */
  wordBoundaries: z.array(WordBoundarySchema).optional(),
  style: z.record(z.union([z.string(), z.number()])).optional(),
  /**
   * Reference into the text style registry (built-in + user). When null /
   * absent the renderer falls back to the variant default for this scene
   * kind, then to `classic`.
   */
  textStyleId: z.string().optional(),
  /**
   * Optional font id override (one of `ALLOWED_FONT_IDS`). Lets a user
   * swap the typeface without forking the entire text style. Variant
   * override and segment override resolve before the style's own
   * `fontFamily`.
   */
  fontOverride: z.string().optional(),
  /**
   * Optional per-segment color overrides. Each field overrides the
   * corresponding TextStyle field at render time. Skipping a field
   * keeps the style's own value — e.g. setting only `accent` on a
   * karaoke preset swaps the highlighted-word color without touching
   * the idle / stroke colors. Variant.colorOverrideBySegmentId wins
   * over this, so per-variant tweaks don't leak across renders.
   */
  colorOverride: ColorOverrideSchema.optional(),
  /**
   * Optional per-segment SFX override. When set, wins over `TextStyle.sfx`
   * at render time. Use to silence a style's cue (set `enterSoundId` to
   * the empty string and the renderer treats it as "none"), or to swap
   * the cue for a different bank entry on this one segment without
   * forking the whole style.
   *
   * Render priority: `segment.sfxOverride` > `textStyle.sfx`.
   */
  sfxOverride: TextSfxSchema.optional(),
  /**
   * Reference to a layout in the global pool at `data/layouts/<id>/`
   * or the built-in registry. When absent the renderer falls back to
   * `builtin-fullBleed` — which is the current pre-layout-library
   * behaviour (image full-bleed + gradient overlay + TextBlock).
   * Storyboards saved before the layout library shipped have no
   * `layoutId` and continue to render unchanged.
   */
  layoutId: z.string().optional(),
  /**
   * Short uppercase label rendered by layouts that have an eyebrow
   * slot — e.g. "CASE FILE", "PRIMARY METRIC", "EP 03". Hard-styled
   * per layout (uppercase tracking, accent colour) so users don't
   * need to tweak typography for it.
   */
  eyebrow: z.string().max(40).optional(),
  /**
   * Up to 5 short pill-style chips rendered by layouts with a chip
   * grid (e.g. dossierCard). Each chip ≤ 30 chars.
   */
  chips: z.array(z.string().max(30)).max(5).optional(),
  /**
   * Optional dossier-style file id ("FILE 02", "PROFILE 03"). Hard-
   * styled per layout — small monospace label near the eyebrow.
   */
  fileId: z.string().max(20).optional(),
})
export type Segment = z.infer<typeof SegmentSchema>

/**
 * A render variant: a named text-style mapping per scene kind. Rendering a
 * project with `variants.length >= 2` produces one mp4 per variant
 * (`output-<id>.mp4`).
 */
export const VariantSchema = z.object({
  id: z.string().min(1), // 'A' | 'B' | 'C' | free-form
  label: z.string(),
  /** id of a TextStyle, keyed by scene kind. */
  textStyleBySceneKind: z.record(z.string()),
  /**
   * Optional per-variant override keyed by segment id. When present, the
   * renderer prefers this over `segment.textStyleId` so a user can pin a
   * style to one segment in one variant without affecting the same
   * segment under other variants.
   */
  textStyleBySegmentId: z.record(z.string()).default({}),
  /**
   * Optional per-variant font override keyed by segment id. Same shape
   * and priority idea as `textStyleBySegmentId` but for typeface only.
   */
  fontOverrideBySegmentId: z.record(z.string()).default({}),
  /**
   * Optional per-variant color override keyed by segment id. Wins over
   * `Segment.colorOverride` so a user can pin a palette to one segment
   * in one variant without affecting the same segment under other
   * variants (mirrors the `textStyleBySegmentId` pattern).
   */
  colorOverrideBySegmentId: z.record(ColorOverrideSchema).default({}),
})
export type Variant = z.infer<typeof VariantSchema>

export const ExportPresetSchema = z.enum(['tiktok', 'youtube-shorts', 'reels', 'standard'])
export type ExportPreset = z.infer<typeof ExportPresetSchema>

// --- Logo / watermark ---------------------------------------------------

/**
 * Common placement controls shared by the image and text logo variants.
 * Position is named so the renderer can compute corner-relative offsets
 * without baking pixel coordinates into the storyboard.
 */
const LogoPlacementShape = {
  position: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .default('top-right'),
  /** Margin from chosen edge, in % of video width (0..15). */
  marginPct: z.number().min(0).max(15).default(5),
  /** 0..1, defaults to 0.85 so the mark sits softly above the visuals. */
  opacity: z.number().min(0).max(1).default(0.85),
  /** Render the watermark for every segment, or only the bookends. */
  appliesTo: z.enum(['all', 'intro-outro-only']).default('all'),
} as const

/**
 * Project-wide watermark. The discriminated union lets the renderer
 * narrow on `kind` once and skip the "is image asset present?" check
 * downstream. `kind: 'none'` keeps the field present-but-inert so the
 * schema default for project.logo can be a typed value.
 */
export const LogoMarkerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('image'),
    /** Absolute path under data/projects/<id>/logo.<ext> after upload. */
    path: z.string(),
    /** Original filename for nicer error messages. */
    originalName: z.string().optional(),
    /** Native pixel dimensions, used to compute aspect ratio. */
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    /** Logo width in % of video width (5..25). */
    sizePct: z.number().min(5).max(25).default(13),
    ...LogoPlacementShape,
  }),
  z.object({
    kind: z.literal('text'),
    /** Watermark text — e.g. "@username", "© NewsTok 2026". */
    text: z.string().min(1).max(40),
    /** Font id, mirrors the ALLOWED_FONT_IDS list used elsewhere. */
    fontId: z.string().default('inter'),
    /** Font size in % of video width (1..6). */
    sizePct: z.number().min(1).max(6).default(2.2),
    color: z.string().default('#ffffff'),
    /** Optional dark plate behind the text for legibility over bright bg. */
    background: z
      .object({
        color: z.string().default('rgba(0,0,0,0.45)'),
        paddingPx: z.number().min(0).max(40).default(10),
        radiusPx: z.number().min(0).max(20).default(6),
      })
      .optional(),
    ...LogoPlacementShape,
  }),
])
export type LogoMarker = z.infer<typeof LogoMarkerSchema>

export const SubtitleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Position relative to bottom (0..1 of video height). */
  bottomPct: z.number().min(0).max(1).default(0.18),
})

/**
 * One user-uploaded SFX cue, scoped to a single project (lives in
 * `data/projects/<id>/sfx/`). Mirrors `SfxEntry` from sfx.ts but stays
 * a separate runtime-validated schema because users author it, whereas
 * the built-in bank is committed code.
 */
export const CustomSfxEntrySchema = z.object({
  /** Slug used in storyboard refs and on disk. Must start with `user-`. */
  id: z.string().regex(/^user-[a-z0-9-]+$/i),
  /** Human label shown in the picker. */
  label: z.string().min(1).max(60),
  /** Duration in seconds, read from the uploaded mp3 at upload time. */
  durationSec: z.number().positive().max(5),
  /** Absolute path to the staged mp3 under data/projects/<id>/sfx/. */
  path: z.string(),
  /** Multiplied into the segment's volume slider. */
  defaultGain: z.number().min(0).max(1).default(1),
  /** Original filename for nicer error messages. */
  originalName: z.string().optional(),
  /** ISO timestamp when the upload landed on disk. */
  uploadedAt: z.string().datetime(),
})
export type CustomSfxEntry = z.infer<typeof CustomSfxEntrySchema>
export type SubtitleConfig = z.infer<typeof SubtitleConfigSchema>

/**
 * Non-destructive edits applied to `project.bgMusic` at render time.
 * The cached mp3 file under `data/cache/music/<hash>.mp3` is never
 * modified — Remotion's `<Audio startFrom endAt>` + frame-based
 * `interpolate` apply trim, fade, and ducking on the fly. That keeps
 * the cache file reusable across projects that trim it differently,
 * and lets the user re-tune any of these knobs without re-fetching
 * the track.
 *
 * Default shape is the empty object `{}`, which resolves to:
 *   - no trim (use the whole track from 0..duration)
 *   - 0s fade-in
 *   - 1.2s fade-out (matches the pre-edit hardcoded behaviour, so
 *     storyboards saved before this schema existed render identically)
 *   - ducking disabled
 */
export const BgMusicEditsSchema = z
  .object({
    /** Seconds to skip at the start of the track. 0 = use from beginning. */
    trimStartSec: z.number().min(0).default(0),
    /**
     * Stop the track at this offset (seconds from track start, NOT from
     * `trimStartSec`). Undefined = play to the end of the file. The
     * renderer clamps against the actual track duration when staging.
     */
    trimEndSec: z.number().min(0).optional(),
    /** Fade-in length at the start of the video. 0 = no fade. */
    fadeInSec: z.number().min(0).max(10).default(0),
    /**
     * Fade-out length at the end of the video. Default 1.2 matches the
     * legacy hardcoded fade so the schema default = previous behavior.
     */
    fadeOutSec: z.number().min(0).max(10).default(1.2),
    /**
     * Sidechain ducking — automatically reduce music volume while narration
     * is speaking, so the voice stays intelligible. Driven by every
     * segment's `wordBoundaries` (no extra signal extraction required).
     * Disabled by default to preserve existing render output.
     */
    ducking: z
      .object({
        enabled: z.boolean().default(false),
        /**
         * Volume multiplier while narration is active, 0..1. 0.3 = music
         * drops to 30% (broadcast-standard "voice over" ratio). 0 mutes
         * music entirely under narration, which often sounds abrupt.
         */
        ratio: z.number().min(0).max(1).default(0.3),
        /**
         * Attack/release smoothing window in milliseconds. Too short
         * (< 100ms) makes the duck "pump" audibly; too long (> 500ms)
         * means the first word of a segment isn't audible because the
         * music hasn't dropped yet. 200ms is a safe broadcast default.
         */
        smoothMs: z.number().int().min(50).max(2000).default(200),
      })
      .default({ enabled: false, ratio: 0.3, smoothMs: 200 }),
  })
  .default({})
export type BgMusicEdits = z.infer<typeof BgMusicEditsSchema>

export const ProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  source: SourceSchema,
  language: LanguageSchema,
  aspect: AspectSchema,
  segments: z.array(SegmentSchema),
  bgMusic: AssetRefSchema.optional(),
  bgMusicVolume: z.number().min(0).max(1).default(0.2),
  /**
   * Non-destructive trim / fade / ducking edits applied to `bgMusic` at
   * render time. Empty default `{}` preserves the pre-edit behavior
   * (no trim, no fade-in, 1.2s fade-out, no ducking).
   */
  bgMusicEdits: BgMusicEditsSchema,
  /** Master volume for text-transition SFX (multiplied into each cue). */
  sfxVolume: z.number().min(0).max(1).default(0.7),
  /**
   * Project-wide SFX kill-switch. When false the renderer skips ALL
   * text-transition / per-word SFX cues regardless of what the
   * TextStyle or per-segment override says — useful for "no chrome"
   * generated videos. Defaults to true to preserve legacy render
   * output on storyboards saved before this flag existed. New
   * projects created via MCP `createProject` write `false`, matching
   * the project convention that generated videos are SFX-free unless
   * the user opts in.
   */
  sfxEnabled: z.boolean().default(true),
  subtitles: SubtitleConfigSchema.default({ enabled: true, bottomPct: 0.18 }),
  /**
   * Show small scene-kind badges (Newspaper + title on title scenes,
   * ListChecks + "Key point" on keypoint scenes). Useful in Studio for
   * dev debugging; hidden in exported video so viewers don't see
   * meta-labels they can't interpret.
   */
  showSceneBadges: z.boolean().default(false),
  exportPreset: ExportPresetSchema.default('standard'),
  /**
   * Render variants. Empty array preserves the legacy single-render behavior
   * (`output.mp4`). Non-empty produces `output-<id>.mp4` per variant.
   */
  variants: z.array(VariantSchema).default([]),
  /** Inline user-authored text styles, merged with built-ins at render time. */
  userTextStyles: z.array(TextStyleSchema).default([]),
  /**
   * User-uploaded SFX files. Each entry's `path` points at
   * `data/projects/<id>/sfx/<slug>.mp3` (absolute). Use the
   * `user-` prefix on `id` to avoid collisions with `BUILT_IN_SFX`.
   * The render staging step copies these into the publicDir alongside
   * the built-in bank so compositions can play either freely.
   */
  customSfx: z.array(CustomSfxEntrySchema).default([]),
  /**
   * Project-wide watermark drawn on top of every segment (or only the
   * intro / outro if `appliesTo` says so). Default is `kind: 'none'`
   * so existing projects render unchanged.
   */
  logo: LogoMarkerSchema.default({ kind: 'none' }),
  /**
   * Per-project image library — the user drag-drops a whole folder of
   * images once, then any segment can pull a background from this list
   * with one click instead of re-uploading or re-searching.
   *
   * Files live under `data/projects/<id>/library/<contenthash>.<ext>`
   * (hash-deduped so re-dropping the same folder is safe). The renderer
   * never reads this list; it's purely an editor convenience that
   * survives reloads via `storyboard.json`.
   */
  library: z.array(AssetRefSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Project = z.infer<typeof ProjectSchema>

export const RenderPresetSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  codec: z.literal('h264'),
  pixelFormat: z.literal('yuv420p'),
})
export type RenderPreset = z.infer<typeof RenderPresetSchema>

export const ASPECT_PRESETS: Record<Aspect, RenderPreset> = {
  '9:16': { width: 1080, height: 1920, fps: 30, codec: 'h264', pixelFormat: 'yuv420p' },
  '16:9': { width: 1920, height: 1080, fps: 30, codec: 'h264', pixelFormat: 'yuv420p' },
  '1:1': { width: 1080, height: 1080, fps: 30, codec: 'h264', pixelFormat: 'yuv420p' },
}

/**
 * Per-export-preset overrides applied on top of the aspect preset.
 * Currently only adjusts fps; bitrate/codec stay constant for now.
 */
export const EXPORT_PRESET_OVERRIDES: Record<ExportPreset, Partial<RenderPreset>> = {
  standard: {},
  tiktok: { fps: 60 },
  'youtube-shorts': { fps: 30 },
  reels: { fps: 30 },
}

export function resolveRenderPreset(aspect: Aspect, exportPreset: ExportPreset = 'standard'): RenderPreset {
  return { ...ASPECT_PRESETS[aspect], ...EXPORT_PRESET_OVERRIDES[exportPreset] }
}

export const DEFAULT_VOICES: Record<Language, string> = {
  vi: 'vi-VN-HoaiMyNeural',
  en: 'en-US-AriaNeural',
}
