import type { Aspect } from '@news-tok/shared/schema'
import type { LayoutComponent } from './types.js'
import { BreakingNews } from './BreakingNews.js'
import { BrowserWindow } from './BrowserWindow.js'
import { Card } from './Card.js'
import { ComparisonSplit } from './ComparisonSplit.js'
import { CrtTerminal } from './CrtTerminal.js'
import { DossierCard } from './DossierCard.js'
import { FullBleed } from './FullBleed.js'
import { GradientMesh } from './GradientMesh.js'
import { HealthCards } from './HealthCards.js'
import { MagazineCover } from './MagazineCover.js'
import { NeonSign } from './NeonSign.js'
import { NumberedSteps } from './NumberedSteps.js'
import { PhoneMockup } from './PhoneMockup.js'
import { PortraitQuote } from './PortraitQuote.js'
import { NewstokvnIntroCover } from './NewstokvnIntroCover.js'
import { NewstokvnIntroMarquee } from './NewstokvnIntroMarquee.js'
import { NewstokvnKeypointBreakingCard } from './NewstokvnKeypointBreakingCard.js'
import { NewstokvnKeypointBulletin } from './NewstokvnKeypointBulletin.js'
import { NewstokvnKeypointComparison } from './NewstokvnKeypointComparison.js'
import { NewstokvnKeypointFlame } from './NewstokvnKeypointFlame.js'
import { NewstokvnKeypointFlashTab } from './NewstokvnKeypointFlashTab.js'
import { NewstokvnKeypointHighlight } from './NewstokvnKeypointHighlight.js'
import { NewstokvnKeypointIncident } from './NewstokvnKeypointIncident.js'
import { NewstokvnKeypointInternational } from './NewstokvnKeypointInternational.js'
import { NewstokvnKeypointQuote } from './NewstokvnKeypointQuote.js'
import { NewstokvnKeypointStat } from './NewstokvnKeypointStat.js'
import { NewstokvnKeypointTimeline } from './NewstokvnKeypointTimeline.js'
import { NewstokvnOutroBanner } from './NewstokvnOutroBanner.js'
import { NewstokvnOutroChannels } from './NewstokvnOutroChannels.js'
import { OutroFollowChannel } from './OutroFollowChannel.js'
import { OutroNextVideo } from './OutroNextVideo.js'
import { OutroSubscribeBurst } from './OutroSubscribeBurst.js'
import { SplitVertical } from './SplitVertical.js'
import { StatHero } from './StatHero.js'
import { StoryChip } from './StoryChip.js'
import { StoryPill } from './StoryPill.js'
import { StoryVtv } from './StoryVtv.js'
import { TimestampedWar } from './TimestampedWar.js'

/**
 * Built-in layouts shipped in the source code. The id namespace matches
 * `LayoutMetaSchema.id`'s regex (`/^(user|builtin)-[a-z0-9-]+$/`).
 *
 * PR-B adds 5 layouts beyond `builtin-fullBleed`. Each carries its own
 * visual identity (media-led card, top-bottom split, magazine cover,
 * type-hero stat callout, dossier folder with chips). The remaining
 * P0 layouts from the plan (polaroid, browserWindow, phoneMockup,
 * neonFrame, gradientMeshHero) land in PR-D once the pattern is
 * validated.
 */
const BUILT_IN_LAYOUTS: Record<string, LayoutComponent> = {
  'builtin-fullBleed': FullBleed,
  'builtin-card': Card,
  'builtin-splitVertical': SplitVertical,
  'builtin-magazineCover': MagazineCover,
  'builtin-statHero': StatHero,
  'builtin-dossierCard': DossierCard,
  // YupVid moodboard ports — 7 new design-forward / chrome-mockup
  // looks. Each is self-contained: no shared CSS between them, so
  // tweaking one can't break another.
  'builtin-phoneMockup': PhoneMockup,
  'builtin-browserWindow': BrowserWindow,
  'builtin-neonSign': NeonSign,
  'builtin-numberedSteps': NumberedSteps,
  'builtin-gradientMesh': GradientMesh,
  'builtin-crtTerminal': CrtTerminal,
  'builtin-comparisonSplit': ComparisonSplit,
  // News & journalism set — Gemini-inspired layouts tuned for VN
  // press / pháp luật / chiến sự / sức khỏe content. Each leans on
  // a distinct slot set so the orchestrator can pick by content
  // shape (headline-driven vs. quote vs. chronology vs. list).
  'builtin-breakingNews': BreakingNews,
  'builtin-portraitQuote': PortraitQuote,
  'builtin-timestampedWar': TimestampedWar,
  'builtin-healthCards': HealthCards,
  // Thumbnail-style 9:16 layouts ported from VN short-form references
  // (showbiz pill, sports yellow-chip, broadcast lower-third). Each
  // supports `**phrase**` accent markup inside `text` — the marked
  // phrase is repainted on a coloured plate or accent fill so the
  // hook word pops at thumbnail size.
  'builtin-storyPill': StoryPill,
  'builtin-storyChip': StoryChip,
  'builtin-storyVtv': StoryVtv,
  // Outro / end-card set — branded CTA layouts that wrap a video.
  // Each leans on the staged NEWSTOKVN logo (via stageBrandAssets)
  // and pairs a different motion language (ring pulse, channel
  // card with animated counter, swipe-up tease) with the same
  // brand mark so a series of videos feels coherent at the close.
  'builtin-outroSubscribeBurst': OutroSubscribeBurst,
  'builtin-outroFollowChannel': OutroFollowChannel,
  'builtin-outroNextVideo': OutroNextVideo,
  // NEWSTOKVN brand-locked set — intro / keypoint / outro layouts
  // built from the channel's banner artwork (deep purple gradient,
  // lightning bolt + flame accents, red BREAKING chips). Each pairs
  // a distinct moment in the video timeline with consistent brand
  // chrome so a series of clips feels like one channel, not seven
  // random templates.
  'builtin-newstokvn-intro-cover': NewstokvnIntroCover,
  'builtin-newstokvn-intro-marquee': NewstokvnIntroMarquee,
  'builtin-newstokvn-keypoint-bulletin': NewstokvnKeypointBulletin,
  'builtin-newstokvn-keypoint-flame': NewstokvnKeypointFlame,
  // Second-wave NEWSTOKVN keypoints — informed by 2026 short-form
  // research (typography-as-hero, kinetic numbers, pull-quote
  // pattern, before/after split). Each picks a different content
  // shape so the orchestrator can pair layout to story: number-
  // driven → stat, direct speech → quote, chronology → timeline,
  // juxtaposition → comparison.
  'builtin-newstokvn-keypoint-stat': NewstokvnKeypointStat,
  'builtin-newstokvn-keypoint-quote': NewstokvnKeypointQuote,
  'builtin-newstokvn-keypoint-timeline': NewstokvnKeypointTimeline,
  'builtin-newstokvn-keypoint-comparison': NewstokvnKeypointComparison,
  // Third-wave NEWSTOKVN keypoints — designs ported from user-
  // provided thumbnail screenshots (breaking-card on red, news-
  // update highlight, international-news with arched chip, flash-
  // news vertical tab, incident triple-tier card). Each holds the
  // brand purple + yellow accent system but borrows a specific
  // editorial idiom from print news.
  'builtin-newstokvn-keypoint-breaking-card': NewstokvnKeypointBreakingCard,
  'builtin-newstokvn-keypoint-highlight': NewstokvnKeypointHighlight,
  'builtin-newstokvn-keypoint-international': NewstokvnKeypointInternational,
  'builtin-newstokvn-keypoint-flash-tab': NewstokvnKeypointFlashTab,
  'builtin-newstokvn-keypoint-incident': NewstokvnKeypointIncident,
  'builtin-newstokvn-outro-channels': NewstokvnOutroChannels,
  'builtin-newstokvn-outro-banner': NewstokvnOutroBanner,
}

/**
 * User layouts at `data/layouts/<id>/layout.tsx` are injected into the
 * bundle by `packages/render/src/bundle.ts` via this global. The render
 * entry source writes the map; this resolver reads it. Mirrors the
 * pattern already in use for custom scenes
 * (see `packages/remotion/src/scenes/registry.ts`).
 */
declare global {
  // eslint-disable-next-line no-var
  var __NEWS_TOK_USER_LAYOUTS__: Record<string, LayoutComponent> | undefined
}

/**
 * Built-in layouts that have been audited for 1:1 (1080×1080). Includes
 * the always-safe `FullBleed` fallback plus a curated subset whose
 * chrome is centered or symmetric (top + bottom around a focal element)
 * so it compresses cleanly to a square canvas. Layouts NOT in this set
 * fall through to `FullBleed` when `project.aspect === '1:1'` so their
 * portrait-tuned hardcoded positions never render at the wrong aspect.
 *
 * Single source of truth — Studio's layout picker imports this same
 * set to dim non-supported cards in the picker UI.
 */
export const LAYOUTS_SUPPORTED_IN_SQUARE: ReadonlySet<string> = new Set([
  'builtin-fullBleed',
  // Generic — see PLAN.md "Curated layout retuning"
  'builtin-storyPill',
  'builtin-storyChip',
  'builtin-storyVtv',
  'builtin-card',
  'builtin-magazineCover',
  'builtin-statHero',
  'builtin-breakingNews',
  // NEWSTOKVN — square-friendly + light-retune candidates from the
  // per-file audit. Other NEWSTOKVN layouts (both intros, both outros,
  // breaking-card, flash-tab, incident, stat, timeline) rely on 3+
  // stacked content blocks and don't compress to 1080-tall.
  'builtin-newstokvn-keypoint-flame',
  'builtin-newstokvn-keypoint-highlight',
  'builtin-newstokvn-keypoint-quote',
  'builtin-newstokvn-keypoint-bulletin',
  'builtin-newstokvn-keypoint-comparison',
  'builtin-newstokvn-keypoint-international',
])

/**
 * Resolve a layout id to the component that renders it. Falls back to
 * `FullBleed` for:
 *   - `undefined` id (storyboards saved before the layout library)
 *   - unknown id (e.g. user deleted the layout but a segment still
 *     references it)
 *   - `aspect === '1:1'` AND the layout isn't in
 *     `LAYOUTS_SUPPORTED_IN_SQUARE` — the layout was tuned for 9:16
 *     only and would render with broken proportions at 1080×1080.
 *
 * This guarantees a renderable layout for every segment — the
 * downstream scene wrapper never has to worry about a missing layout.
 */
export function resolveLayout(id?: string, aspect?: Aspect): LayoutComponent {
  if (!id) return FullBleed
  if (aspect === '1:1' && !LAYOUTS_SUPPORTED_IN_SQUARE.has(id)) return FullBleed
  const user = globalThis.__NEWS_TOK_USER_LAYOUTS__
  return user?.[id] ?? BUILT_IN_LAYOUTS[id] ?? FullBleed
}

/** Enumerate the built-in layout ids — used by Studio to populate the
 *  segment-editor layout dropdown without round-tripping to disk. */
export function listBuiltInLayouts(): string[] {
  return Object.keys(BUILT_IN_LAYOUTS)
}
