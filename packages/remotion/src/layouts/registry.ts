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
 * Resolve a layout id to the component that renders it. Falls back to
 * `FullBleed` for:
 *   - `undefined` id (storyboards saved before the layout library)
 *   - unknown id (e.g. user deleted the layout but a segment still
 *     references it)
 *
 * This guarantees a renderable layout for every segment — the
 * downstream scene wrapper never has to worry about a missing layout.
 */
export function resolveLayout(id?: string): LayoutComponent {
  if (!id) return FullBleed
  const user = globalThis.__NEWS_TOK_USER_LAYOUTS__
  return user?.[id] ?? BUILT_IN_LAYOUTS[id] ?? FullBleed
}

/** Enumerate the built-in layout ids — used by Studio to populate the
 *  segment-editor layout dropdown without round-tripping to disk. */
export function listBuiltInLayouts(): string[] {
  return Object.keys(BUILT_IN_LAYOUTS)
}
