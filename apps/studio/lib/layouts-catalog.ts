import type { LayoutFamily } from '@news-tok/shared/layout-meta'
import type { Aspect } from '@news-tok/shared/schema'

/**
 * Layouts retuned + visually audited at 1080×1080. Single source of
 * truth lives in `packages/remotion/src/layouts/registry.ts`
 * (`LAYOUTS_SUPPORTED_IN_SQUARE`). Studio mirrors that set here so the
 * layout-picker can dim non-supported cards when `project.aspect ===
 * '1:1'` — those layouts auto-fall-back to FullBleed at render time.
 *
 * Keep in sync with the renderer set: editing one without the other
 * means Studio shows a layout as "supported" while the renderer
 * actually falls it back, or vice versa.
 */
const SUPPORTED_IN_SQUARE = new Set<string>([
  'builtin-fullBleed',
  'builtin-storyPill',
  'builtin-storyChip',
  'builtin-storyVtv',
  'builtin-card',
  'builtin-magazineCover',
  'builtin-statHero',
  'builtin-breakingNews',
  'builtin-newstokvn-keypoint-flame',
  'builtin-newstokvn-keypoint-highlight',
  'builtin-newstokvn-keypoint-quote',
  'builtin-newstokvn-keypoint-bulletin',
  'builtin-newstokvn-keypoint-comparison',
  'builtin-newstokvn-keypoint-international',
])

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
  // Outro / end-card set — branded CTA layouts to close a video.
  // All three pull the NEWSTOKVN brand logo from the staged
  // public dir; no per-segment media required (NextVideo accepts
  // an optional teaser still).
  {
    id: 'builtin-outroSubscribeBurst',
    name: 'Outro — subscribe burst',
    family: 'design-forward',
    slots: { media: false, eyebrow: true, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-outroSubscribeBurst.png',
    hint:
      'Center NEWSTOKVN logo + concentric pulse rings + bouncing "NHẤN THEO DÕI" CTA + thumbs-up / bell icons fly in.',
  },
  {
    id: 'builtin-outroFollowChannel',
    name: 'Outro — follow channel',
    family: 'editorial',
    slots: { media: false, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-outroFollowChannel.png',
    hint:
      'VTV/YouTube channel card: logo + name (text) + handle (eyebrow) + animated follower counter (fileId target) + yellow "THEO DÕI KÊNH" button.',
  },
  {
    id: 'builtin-outroNextVideo',
    name: 'Outro — next video tease',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-outroNextVideo.png',
    hint:
      'Tease the next clip: background photo + "VIDEO TIẾP THEO" eyebrow + bold headline + triple-stack swipe-up chevron with "Vuốt lên xem ngay".',
  },
  // NEWSTOKVN brand-locked set — intro / keypoint / outro layouts
  // built from the channel's banner artwork. Use as the opening
  // beat (intro), main story beats (keypoint), and closing card
  // (outro) so the whole video reads as one channel.
  {
    id: 'builtin-newstokvn-intro-cover',
    name: 'NEWSTOKVN — Intro cover',
    family: 'editorial',
    slots: { media: false, eyebrow: true, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-newstokvn-intro-cover.png',
    hint:
      'Brand cover intro: deep purple radial + centered NEWSTOKVN logo + gradient caps headline + yellow lightning bolts.',
  },
  {
    id: 'builtin-newstokvn-intro-marquee',
    name: 'NEWSTOKVN — Intro marquee',
    family: 'editorial',
    slots: { media: false, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-intro-marquee.png',
    hint:
      'Energetic intro: pulsing red "CẬP NHẬT LIÊN TỤC" chip + slide-in marquee headline + flame badge + "BREAKING NEWS 24/7" red chip.',
  },
  {
    id: 'builtin-newstokvn-keypoint-bulletin',
    name: 'NEWSTOKVN — Bulletin keypoint',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-bulletin.png',
    hint:
      'TV-bulletin keypoint: purple "NEWSTOKVN · TIN NÓNG" header + boxed media + purple-plate headline + footer category strip.',
  },
  {
    id: 'builtin-newstokvn-keypoint-flame',
    name: 'NEWSTOKVN — Flame keypoint',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: false, fileId: false },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-flame.png',
    hint:
      'Punchy keypoint: full-bleed photo + top-left flame chip + bold white headline with **purple plate** accent on the hook phrase.',
  },
  {
    id: 'builtin-newstokvn-keypoint-stat',
    name: 'NEWSTOKVN — Stat hero',
    family: 'design-forward',
    slots: { media: true, eyebrow: true, chips: true, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-stat.png',
    hint:
      'Single-number hero: photo top + huge gradient stat number (fileId) + label (chips[0]) + headline body. Use when the story is one big number ("45 TỶ ĐỒNG", "1.600 TẤN", "47%").',
  },
  {
    id: 'builtin-newstokvn-keypoint-quote',
    name: 'NEWSTOKVN — Pull quote',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-quote.png',
    hint:
      'Pull quote: full-bleed portrait + big purple quote glyph + italic serif quote (auto-wrapped in curly quotes) + attribution line ("— Theo VTV24"). Best for direct statements.',
  },
  {
    id: 'builtin-newstokvn-keypoint-timeline',
    name: 'NEWSTOKVN — Timeline chronology',
    family: 'media-led',
    slots: { media: true, eyebrow: true, chips: true, fileId: false },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-timeline.png',
    hint:
      'Chronology: photo top + 3 timestamped events (chips: "05:00 · event"). Best for "what happened, in order" — incident recaps, war-day events.',
  },
  {
    id: 'builtin-newstokvn-keypoint-comparison',
    name: 'NEWSTOKVN — Before/after compare',
    family: 'media-led',
    slots: { media: true, eyebrow: false, chips: true, fileId: false },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-comparison.png',
    hint:
      'Before/after split: 2 stacked photo frames (background + foreground[0]) with TRƯỚC / SAU chips (override via chips[0..1]) + VS badge + bottom headline.',
  },
  {
    id: 'builtin-newstokvn-keypoint-breaking-card',
    name: 'NEWSTOKVN — Breaking news card',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-breaking-card.png',
    hint:
      'White photo card on brand purple with red BREAKING NEWS arched chip on top + red headline + rotating LIVE globe badge + lower-third "HOT NEWS THIS MORNING" + follow footer.',
  },
  {
    id: 'builtin-newstokvn-keypoint-highlight',
    name: 'NEWSTOKVN — Yellow highlight bar',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-highlight.png',
    hint:
      'Magazine-style: photo full-bleed + yellow NEWS UPDATE chip top-left + bold caps headline with **yellow highlight bar** on accent phrases + leaf icon "Đọc thêm" CTA.',
  },
  {
    id: 'builtin-newstokvn-keypoint-international',
    name: 'NEWSTOKVN — International news',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-international.png',
    hint:
      'World-news look: red INTERNATIONAL NEWS arched chip top + slightly desaturated photo + bottom plate with yellow timestamp pill (fileId) + huge headline + subtitle body (eyebrow) + "ĐỌC THÊM" link.',
  },
  {
    id: 'builtin-newstokvn-keypoint-flash-tab',
    name: 'NEWSTOKVN — Flash news tab',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-flash-tab.png',
    hint:
      'Editorial flash card: top brand row + photo upper half + vertical FLASH NEWS red tab sticker on photo edge + purple lower-third caption + "More details →" link.',
  },
  {
    id: 'builtin-newstokvn-keypoint-incident',
    name: 'NEWSTOKVN — Incident report',
    family: 'editorial',
    slots: { media: true, eyebrow: true, chips: true, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-keypoint-incident.png',
    hint:
      'Triple-tier incident card: top brand row + red SỰ CỐ chip + boxed evidence photo + dark plate with Breaking News chip + headline + body (chips[0]) + Read More + source line (fileId).',
  },
  {
    id: 'builtin-newstokvn-outro-channels',
    name: 'NEWSTOKVN — Outro categories',
    family: 'editorial',
    slots: { media: false, eyebrow: true, chips: true, fileId: false },
    thumbnail: '/layout-previews/builtin-newstokvn-outro-channels.png',
    hint:
      'Brand outro: logo + handle + 2-row grid of category chips (defaults to THỜI SỰ / PHÁP LUẬT / KHOA HỌC / CÔNG NGHỆ / ...) + red "THEO DÕI NGAY" CTA.',
  },
  {
    id: 'builtin-newstokvn-outro-banner',
    name: 'NEWSTOKVN — Outro banner recap',
    family: 'editorial',
    slots: { media: false, eyebrow: true, chips: false, fileId: true },
    thumbnail: '/layout-previews/builtin-newstokvn-outro-banner.png',
    hint:
      'Mirrors the Intro cover at the END of the video — flame + BREAKING badges, centered logo, gradient headline, tagline. Closes the channel brand loop.',
  },
]

/** Look up a layout meta by id; returns undefined for user layouts
 *  (which Studio would resolve from disk in a later PR). */
export function getBuiltInLayout(id: string): BuiltInLayoutMeta | undefined {
  return BUILT_IN_LAYOUTS.find((l) => l.id === id)
}

/**
 * True when the layout is in the curated 1:1-supported set. The
 * renderer's `resolveLayout(id, '1:1')` falls back to FullBleed for
 * layouts NOT in this set, so callers (e.g. layout picker) can use
 * this to dim those cards under aspect '1:1'.
 */
export function isLayoutSupportedAtAspect(id: string, aspect: Aspect): boolean {
  if (aspect !== '1:1') return true
  return SUPPORTED_IN_SQUARE.has(id)
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
