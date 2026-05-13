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
  textStroke: z.object({ widthPx: z.number(), color: z.string() }).optional(),
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

export const SubtitleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Position relative to bottom (0..1 of video height). */
  bottomPct: z.number().min(0).max(1).default(0.18),
})
export type SubtitleConfig = z.infer<typeof SubtitleConfigSchema>

export const ProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  source: SourceSchema,
  language: LanguageSchema,
  aspect: AspectSchema,
  segments: z.array(SegmentSchema),
  bgMusic: AssetRefSchema.optional(),
  bgMusicVolume: z.number().min(0).max(1).default(0.2),
  /** Master volume for text-transition SFX (multiplied into each cue). */
  sfxVolume: z.number().min(0).max(1).default(0.7),
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
