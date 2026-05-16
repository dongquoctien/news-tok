import type { LayoutFamily } from '@news-tok/shared/layout-meta'

/**
 * Catalog of built-in layouts known to Studio. Mirrors the keys in
 * `packages/remotion/src/layouts/registry.ts:BUILT_IN_LAYOUTS` plus
 * the metadata Studio needs to populate the segment-editor dropdown
 * (label, family, slot requirements).
 *
 * User layouts at `data/layouts/<id>/` carry the same metadata in
 * their sidecar `meta.json`. Eventually this catalog will be merged
 * with the disk-scanned user layouts behind a single API; for PR-C
 * the built-in list is enough.
 */
export type BuiltInLayoutMeta = {
  id: string
  name: string
  family: LayoutFamily
  /** Which slots the layout reads. The segment editor hides inputs
   *  for slots a layout doesn't use, so picking `statHero` doesn't
   *  show a Media swap button etc. */
  slots: {
    media: boolean
    eyebrow: boolean
    chips: boolean
    fileId: boolean
  }
  /** Path to a pre-rendered thumbnail under `public/layout-previews/`.
   *  When the file is missing the dropdown shows a placeholder. */
  thumbnail: string
  /** Tooltip / description shown under the name. */
  hint: string
}

export const BUILT_IN_LAYOUTS: BuiltInLayoutMeta[] = [
  {
    id: 'builtin-fullBleed',
    name: 'Full bleed',
    family: 'media-led',
    slots: { media: true, eyebrow: false, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-fullBleed.png',
    hint: 'Photo fills the frame, headline overlays — the legacy default.',
  },
  {
    id: 'builtin-card',
    name: 'Card',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-card.png',
    hint: 'Media in a rounded panel; headline in a band below.',
  },
  {
    id: 'builtin-splitVertical',
    name: 'Split (vertical)',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-splitVertical.png',
    hint: 'Photo top 60%, headline in a dark band underneath.',
  },
  {
    id: 'builtin-magazineCover',
    name: 'Magazine cover',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-magazineCover.png',
    hint: 'Editorial: full-bleed photo + huge headline bottom-left.',
  },
  {
    id: 'builtin-statHero',
    name: 'Stat hero',
    family: 'design-forward',
    slots: { media: false, eyebrow: true, chips: true, fileId: true },
    thumbnail: '/layout-previews/builtin-statHero.png',
    hint: 'Typography-only — best for big numbers ("47%", "$2.1B").',
  },
  {
    id: 'builtin-dossierCard',
    name: 'Dossier card',
    family: 'design-forward',
    slots: { media: true, eyebrow: true, chips: true, fileId: true },
    thumbnail: '/layout-previews/builtin-dossierCard.png',
    hint: '"Case file" — chips read as evidence tags at the bottom.',
  },
  {
    id: 'builtin-phoneMockup',
    name: 'Phone mockup',
    family: 'chrome-mockup',
    slots: { media: true, eyebrow: true, chips: true, fileId: false },
    thumbnail: '/layout-previews/builtin-phoneMockup.png',
    hint: 'Phone bezel on the left, file-id chips stacked on the right.',
  },
  {
    id: 'builtin-browserWindow',
    name: 'Browser window',
    family: 'chrome-mockup',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-browserWindow.png',
    hint: 'Mac-style window chrome; fileId surfaces in the URL bar.',
  },
  {
    id: 'builtin-neonSign',
    name: 'Neon sign',
    family: 'design-forward',
    slots: { media: true, eyebrow: true, chips: true, fileId: true },
    thumbnail: '/layout-previews/builtin-neonSign.png',
    hint: 'Glowing neon emblem (uses fileId as the sign text).',
  },
  {
    id: 'builtin-numberedSteps',
    name: 'Numbered steps',
    family: 'design-forward',
    slots: { media: true, eyebrow: true, chips: true, fileId: true },
    thumbnail: '/layout-previews/builtin-numberedSteps.png',
    hint: 'Red plate headline + 01/02/03 step rows (chips become steps).',
  },
  {
    id: 'builtin-gradientMesh',
    name: 'Gradient mesh',
    family: 'design-forward',
    slots: { media: false, eyebrow: true, chips: true, fileId: false },
    thumbnail: '/layout-previews/builtin-gradientMesh.png',
    hint: 'Typography-only — peach→indigo mesh with chat-bubble chips.',
  },
  {
    id: 'builtin-crtTerminal',
    name: 'CRT terminal',
    family: 'chrome-mockup',
    slots: { media: true, eyebrow: true, chips: true, fileId: true },
    thumbnail: '/layout-previews/builtin-crtTerminal.png',
    hint: 'Retro CRT screen with scanlines, terminal prompt + tag log.',
  },
  {
    id: 'builtin-comparisonSplit',
    name: 'Comparison split',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: true, fileId: true },
    thumbnail: '/layout-previews/builtin-comparisonSplit.png',
    hint: '"Evidence overlay" — photo top, dot-list of facts beneath.',
  },
  // News & journalism set — Gemini-inspired layouts tuned for VN
  // press / pháp luật / chiến sự / sức khỏe content.
  {
    id: 'builtin-breakingNews',
    name: 'Breaking news',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-breakingNews.png',
    hint:
      'Red "BREAKING" banner top, boxed media + LIVE dot, headline with blue drop-shadow.',
  },
  {
    id: 'builtin-portraitQuote',
    name: 'Portrait quote',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-portraitQuote.png',
    hint:
      'Subject portrait full-bleed + pull quote on a gold-rule plate; name tag along the bottom.',
  },
  {
    id: 'builtin-timestampedWar',
    name: 'Field report',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: true, fileId: false },
    thumbnail: '/layout-previews/builtin-timestampedWar.png',
    hint:
      'Olive + steel war-coverage tone; chips become "04:30 AM · event" chronology.',
  },
  {
    id: 'builtin-healthCards',
    name: 'Health cards',
    family: 'design-forward',
    slots: { media: true, eyebrow: true, chips: true, fileId: false },
    thumbnail: '/layout-previews/builtin-healthCards.png',
    hint:
      'Clean medical palette; chips become icon cards (auto-picks water/sleep/leaf/heart).',
  },
  // Thumbnail-style 9:16 layouts — ported from VN short-form references.
  // Each supports `**phrase**` accent markers inside `segment.text`; the
  // marked phrase is repainted on a coloured plate / accent fill so the
  // hook word pops at thumbnail size.
  {
    id: 'builtin-storyPill',
    name: 'Story pill',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-storyPill.png',
    hint:
      'Showbiz / lifestyle thumb: white pill on top, bold white headline at bottom with a red-plate accent on **phrase**.',
  },
  {
    id: 'builtin-storyChip',
    name: 'Story chip',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-storyChip.png',
    hint:
      'Sports / fan thumb: yellow chip bottom-left, huge uppercase headline with yellow accent on **phrase**.',
  },
  {
    id: 'builtin-storyVtv',
    name: 'Story VTV',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-storyVtv.png',
    hint:
      'Broadcast / thời sự lower-third: channel tag top-left (fileId) + red category chip (eyebrow) + bottom headline.',
  },
]

/** Look up a layout meta by id; returns undefined for user layouts
 *  (which Studio would resolve from disk in a later PR). */
export function getBuiltInLayout(id: string): BuiltInLayoutMeta | undefined {
  return BUILT_IN_LAYOUTS.find((l) => l.id === id)
}

/** True when `getBuiltInLayout(id)` requires `segment.eyebrow`, used
 *  by the editor to surface the input. */
export function layoutNeedsSlot(
  id: string | undefined,
  slot: keyof BuiltInLayoutMeta['slots']
): boolean {
  if (!id) return false
  const meta = getBuiltInLayout(id)
  return meta ? meta.slots[slot] : false
}
