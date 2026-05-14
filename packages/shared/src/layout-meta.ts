import { z } from 'zod'

/**
 * Metadata for a layout in the global pool at `data/layouts/<id>/meta.json`.
 *
 * A layout = a React component that decides "how to arrange the frame" for
 * one segment. Compared to scenes (which fully own a frame including
 * background and effects), layouts are slot-driven: they receive a
 * `LayoutProps` payload from the scene wrapper and decide where headline,
 * eyebrow, chips, and media land on screen.
 *
 * This schema describes only the metadata sidecar, not the layout TSX.
 * The TSX lives at `data/layouts/<id>/layout.tsx` (user-authored) or
 * `packages/remotion/src/layouts/<Name>.tsx` (built-in). The registry
 * resolver (`packages/remotion/src/layouts/registry.ts`) picks the
 * component at render time.
 */

export const LayoutFamilySchema = z.enum([
  // Photo / media in the foreground. fullBleed, card, polaroid,
  // splitVertical, collage.
  'media-led',
  // Layouts that imitate a UI surface. browserWindow, phoneMockup,
  // terminalWindow, tweetCard.
  'chrome-mockup',
  // Editorial typography. magazineCover, dropCap, pullQuote,
  // newspaperClipping.
  'editorial',
  // Heavily styled hero layouts. neonFrame, gradientMeshHero,
  // statHero, dossierCard.
  'design-forward',
  // User-created layout that doesn't fit a built-in family.
  'custom',
])
export type LayoutFamily = z.infer<typeof LayoutFamilySchema>

export const LayoutMetaSchema = z.object({
  /**
   * Namespaced id. `builtin-` for layouts shipped in the source code,
   * `user-` for layouts at `data/layouts/<id>/`. Enforced by regex so
   * a user can't accidentally claim a builtin slug.
   */
  id: z.string().regex(/^(user|builtin)-[a-z0-9-]+$/),
  name: z.string().min(1).max(60),
  family: LayoutFamilySchema,
  tags: z.array(z.string()).default([]),
  // Slot requirements used by the orchestrator to filter the pool
  // before picking a layout for a segment. e.g. `statHero` needs no
  // media; `dossierCard` needs media + eyebrow + ≥ 2 chips.
  requiresMedia: z.boolean().default(false),
  requiresEyebrow: z.boolean().default(false),
  requiresChips: z.boolean().default(false),
  minChips: z.number().int().min(0).default(0),
  maxChips: z.number().int().min(0).default(5),
  source: z.enum(['builtin', 'user']).default('user'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Optional original brief used to generate the layout — kept so the
   *  Studio layout editor can show "this was created from …" context
   *  and so `updateLayout` can re-feed the brief during regenerate. */
  brief: z.string().optional(),
  /** Paths to reference images the user supplied at create time.
   *  Stored under `data/layouts/<id>/reference/`. */
  referenceImages: z.array(z.string()).default([]),
  /** Text styles that pair visually well with this layout. Studio
   *  surfaces a "Recommended for X" badge in the text-style picker;
   *  no auto-apply. */
  recommendedTextStyles: z.array(z.string()).default([]),
})
export type LayoutMeta = z.infer<typeof LayoutMetaSchema>
