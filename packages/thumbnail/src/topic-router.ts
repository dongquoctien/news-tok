import type { ThumbnailLayout } from '@news-tok/shared/schema'

/**
 * Map a topic id (from `research.classifyTopic`) to the best thumbnail
 * layout + default palette + eyebrow label.
 *
 * The same six layouts cover the 13 known topics. When a new topic is
 * added to research.ts and not listed here, callers fall back to
 * `news-breaking` — a safe default that reads as "news" without being
 * topic-specific.
 *
 * Eyebrow text is the small all-caps chip the layout shows in the
 * corner (e.g. NÓNG / GIẢI TRÍ / KHOA HỌC). The Claude orchestrator can
 * override it via `edits.eyebrow`, but we ship a sensible default so a
 * one-shot `generateThumbnail` produces a complete thumb.
 */

export type ThumbnailTopic =
  | 'crime'
  | 'finance'
  | 'tech'
  | 'health'
  | 'sports'
  | 'entertainment'
  | 'lifestyle'
  | 'travel'
  | 'food'
  | 'nature'
  | 'politics'
  | 'education'
  | 'generic'

export type LayoutRecipe = {
  layout: ThumbnailLayout
  /** Used by layout to colour the accent plate / chip / dominant fill. */
  palette: {
    primary: string
    accent: string
    ink: string
    /** Optional contrasting colour for the secondary chip. */
    secondary?: string
  }
  /** ALL-CAPS short label shown in the corner chip. */
  defaultEyebrow: { vi: string; en: string }
}

export const TOPIC_TO_LAYOUT: Record<ThumbnailTopic, LayoutRecipe> = {
  crime: {
    layout: 'news-breaking',
    palette: { primary: '#E11D48', accent: '#FFFFFF', ink: '#0F172A' },
    defaultEyebrow: { vi: 'NÓNG', en: 'BREAKING' },
  },
  politics: {
    layout: 'news-breaking',
    palette: { primary: '#1E3A8A', accent: '#FFFFFF', ink: '#0F172A' },
    defaultEyebrow: { vi: 'THỜI SỰ', en: 'NEWS' },
  },
  finance: {
    layout: 'news-breaking',
    palette: { primary: '#FACC15', accent: '#0F172A', ink: '#0F172A' },
    defaultEyebrow: { vi: 'TÀI CHÍNH', en: 'FINANCE' },
  },
  // Weather + broadcast-style hard news uses the VTV-flavoured layout.
  // No "weather" topic in research.ts yet — politics maps here as well via
  // the secondary recipe; left as the documented opt-in target.
  // Callers can pass `layout: 'news-weather'` explicitly when needed.
  entertainment: {
    layout: 'entertainment-bomb',
    palette: { primary: '#FACC15', accent: '#E11D48', ink: '#1F2937' },
    defaultEyebrow: { vi: 'GIẢI TRÍ', en: 'SHOWBIZ' },
  },
  lifestyle: {
    layout: 'entertainment-bomb',
    palette: { primary: '#F472B6', accent: '#FFFFFF', ink: '#831843' },
    defaultEyebrow: { vi: 'LIFESTYLE', en: 'LIFESTYLE' },
  },
  tech: {
    layout: 'science-clean',
    palette: { primary: '#0EA5E9', accent: '#F8FAFC', ink: '#0B1426', secondary: '#1E3A8A' },
    defaultEyebrow: { vi: 'CÔNG NGHỆ', en: 'TECH' },
  },
  health: {
    layout: 'science-clean',
    palette: { primary: '#10B981', accent: '#ECFDF5', ink: '#064E3B', secondary: '#0F766E' },
    defaultEyebrow: { vi: 'SỨC KHOẺ', en: 'HEALTH' },
  },
  nature: {
    layout: 'science-clean',
    palette: { primary: '#166534', accent: '#ECFDF5', ink: '#0B0B0F', secondary: '#15803D' },
    defaultEyebrow: { vi: 'MÔI TRƯỜNG', en: 'NATURE' },
  },
  education: {
    layout: 'knowledge-bookish',
    palette: { primary: '#0F172A', accent: '#FFF7ED', ink: '#0F172A', secondary: '#B45309' },
    defaultEyebrow: { vi: 'KIẾN THỨC', en: 'KNOWLEDGE' },
  },
  travel: {
    layout: 'knowledge-bookish',
    palette: { primary: '#0F172A', accent: '#F0F9FF', ink: '#0C4A6E', secondary: '#0EA5E9' },
    defaultEyebrow: { vi: 'KHÁM PHÁ', en: 'TRAVEL' },
  },
  food: {
    layout: 'knowledge-bookish',
    palette: { primary: '#0F172A', accent: '#FFF7ED', ink: '#7C2D12', secondary: '#EA580C' },
    defaultEyebrow: { vi: 'ẨM THỰC', en: 'FOOD' },
  },
  sports: {
    layout: 'sports-hype',
    palette: { primary: '#FACC15', accent: '#FFFFFF', ink: '#0F172A' },
    defaultEyebrow: { vi: 'THỂ THAO', en: 'SPORTS' },
  },
  generic: {
    layout: 'news-breaking',
    palette: { primary: '#E11D48', accent: '#FFFFFF', ink: '#0F172A' },
    defaultEyebrow: { vi: 'TIN MỚI', en: 'NEWS' },
  },
}

/** Resolve a topic id to its layout recipe, falling back to `generic`. */
export function recipeForTopic(topic: string): LayoutRecipe {
  const recipe = (TOPIC_TO_LAYOUT as Record<string, LayoutRecipe | undefined>)[topic]
  return recipe ?? TOPIC_TO_LAYOUT.generic
}
