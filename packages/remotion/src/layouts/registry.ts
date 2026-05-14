import type { LayoutComponent } from './types.js'
import { Card } from './Card.js'
import { DossierCard } from './DossierCard.js'
import { FullBleed } from './FullBleed.js'
import { MagazineCover } from './MagazineCover.js'
import { SplitVertical } from './SplitVertical.js'
import { StatHero } from './StatHero.js'

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
