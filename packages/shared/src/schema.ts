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
})
export type Segment = z.infer<typeof SegmentSchema>

export const ExportPresetSchema = z.enum(['tiktok', 'youtube-shorts', 'reels', 'standard'])
export type ExportPreset = z.infer<typeof ExportPresetSchema>

export const SubtitleConfigSchema = z.object({
  enabled: z.boolean().default(false),
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
  subtitles: SubtitleConfigSchema.default({ enabled: false, bottomPct: 0.18 }),
  exportPreset: ExportPresetSchema.default('standard'),
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
