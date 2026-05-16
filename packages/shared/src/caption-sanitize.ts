/**
 * Caption sanitizer for social-media platforms.
 *
 * Background: TikTok, Instagram Reels, and YouTube Shorts aggressively
 * suppress / demonetize content containing certain words ("kill",
 * "suicide", "chết", "ma túy"...). Facebook and YouTube long-form are
 * less aggressive but still reduce reach for the worst offenders. The
 * creator community has evolved two coping patterns:
 *
 *   - **dot-insertion** — "chết" → "c.h.ế.t". Cheap, ugly, universal.
 *     Works against keyword scans but reads as broken text. Standard
 *     on TikTok / IG Reels / YT Shorts.
 *   - **euphemism** — "chết" → "không còn", "kill" → "unalive". Reads
 *     naturally; less effective against modern scans because algorithms
 *     have caught most popular ones. Better for long-form FB / YouTube
 *     where reading flow matters.
 *
 * This module exposes both strategies behind one function. Word lists
 * focus on Tier 1 (hard-ban) only — about 20 entries per language —
 * to keep false-positive rate low. Adjacent categories (graphic, sex,
 * profanity) are intentionally NOT covered here; they're either too
 * context-dependent (graphic) or rarely surface in news captions
 * (sex, profanity), so blanket sanitization would do more harm than
 * good for the news-tok use case.
 *
 * The patterns use Unicode word boundaries so substrings inside larger
 * words (e.g. "chếtinh" — nonsense, but defensive) don't trigger. We
 * deliberately allow already-sanitized text through unchanged: a caller
 * who hand-types "c.h.ế.t" should not get "c.h.ế.t" → "c.h.ế.t.".
 */

export type SanitizeStrategy = 'dot' | 'euphemism' | 'off'

/**
 * Language for the sanitizer. We define this locally instead of
 * importing `Language` from `./schema.js` so this module can be
 * pulled into client bundles without dragging in zod (schema.ts is
 * heavy and not browser-friendly for non-validation callers).
 */
type SanitizeLanguage = 'vi' | 'en'

export type SanitizeReplacement = {
  /** The exact substring that was rewritten (case preserved). */
  from: string
  /** What it became. */
  to: string
  /** Position in the ORIGINAL string. */
  index: number
}

export type SanitizeResult = {
  text: string
  replacements: SanitizeReplacement[]
}

type WordEntry = {
  /**
   * Regex matching the original word in case-insensitive form. Must
   * include explicit word-boundary lookarounds because `\b` does not
   * understand Vietnamese diacritics (\\b matches between any
   * non-letter and "ế" because ế is a letter, but \\b also matches at
   * positions Vietnamese readers would consider word-internal). We
   * use `(?<![\\p{L}])` / `(?![\\p{L}])` instead.
   */
  pattern: RegExp
  /**
   * Dot-inserted form ("chết" → "c.h.ế.t"). Pre-computed because
   * splitting Unicode strings by character is non-trivial (combining
   * marks) and we want deterministic output.
   */
  dot: string
  /**
   * Natural-language replacement ("chết" → "không còn"). Picked from
   * what the Vietnamese / English creator community most commonly
   * uses on FB / long-form YouTube where readability matters.
   */
  euphemism: string
}

/**
 * Tier-1 Vietnamese terms. Sources:
 *   - Community usage on TikTok VN (algospeak observations)
 *   - Vietnamese cybersecurity-law sensitive categories (drugs,
 *     terrorism, weapons, self-harm)
 *
 * Each pattern uses the explicit Unicode-aware lookaround pair so
 * "chết" matches but "chếtinh" (defensive) does not. Order matters
 * only for overlapping patterns; we keep most-specific first.
 */
const VI_TIER1: WordEntry[] = [
  // self-harm
  { pattern: /(?<![\p{L}])tự tử(?![\p{L}])/giu, dot: 't.ự t.ử', euphemism: 'tự kết liễu' },
  { pattern: /(?<![\p{L}])tự sát(?![\p{L}])/giu, dot: 't.ự s.á.t', euphemism: 'tự kết liễu' },
  // death / killing
  { pattern: /(?<![\p{L}])chết(?![\p{L}])/giu, dot: 'c.h.ế.t', euphemism: 'không còn' },
  { pattern: /(?<![\p{L}])giết(?![\p{L}])/giu, dot: 'g.i.ế.t', euphemism: 'triệt hạ' },
  { pattern: /(?<![\p{L}])tử vong(?![\p{L}])/giu, dot: 't.ử v.o.n.g', euphemism: 'không qua khỏi' },
  { pattern: /(?<![\p{L}])máu(?![\p{L}])/giu, dot: 'm.á.u', euphemism: 'thương tích' },
  { pattern: /(?<![\p{L}])xác chết(?![\p{L}])/giu, dot: 'x.á.c c.h.ế.t', euphemism: 'thi thể' },
  // drugs
  { pattern: /(?<![\p{L}])ma túy(?![\p{L}])/giu, dot: 'm.a t.ú.y', euphemism: 'chất cấm' },
  { pattern: /(?<![\p{L}])heroin(?![\p{L}])/giu, dot: 'h.e.r.o.i.n', euphemism: 'chất cấm' },
  { pattern: /(?<![\p{L}])cocaine(?![\p{L}])/giu, dot: 'c.o.c.a.i.n.e', euphemism: 'chất cấm' },
  { pattern: /(?<![\p{L}])cần sa(?![\p{L}])/giu, dot: 'c.ầ.n s.a', euphemism: 'chất cấm' },
  // violence / weapons
  { pattern: /(?<![\p{L}])súng(?![\p{L}])/giu, dot: 's.ú.n.g', euphemism: 'vũ khí nóng' },
  { pattern: /(?<![\p{L}])vũ khí(?![\p{L}])/giu, dot: 'v.ũ k.h.í', euphemism: 'binh khí' },
  { pattern: /(?<![\p{L}])bom(?![\p{L}])/giu, dot: 'b.o.m', euphemism: 'chất nổ' },
  { pattern: /(?<![\p{L}])khủng bố(?![\p{L}])/giu, dot: 'k.h.ủ.n.g b.ố', euphemism: 'bạo động' },
  // adult
  { pattern: /(?<![\p{L}])khiêu dâm(?![\p{L}])/giu, dot: 'k.h.i.ê.u d.â.m', euphemism: '18+' },
  { pattern: /(?<![\p{L}])dâm ô(?![\p{L}])/giu, dot: 'd.â.m ô', euphemism: 'xâm hại' },
]

/**
 * Tier-1 English terms. Sources:
 *   - Algospeak Wikipedia (curated list)
 *   - YouTube advertiser-friendly guidelines (suicide / drugs / firearms)
 *   - TikTok / IG creator community usage in 2024-2026
 *
 * Euphemisms favor terms that are already widely understood (unalive,
 * SA) over made-up ones (sewer slide) — the latter look spammy when
 * Studio surfaces the rewritten caption.
 */
const EN_TIER1: WordEntry[] = [
  // self-harm
  { pattern: /(?<![\p{L}])suicide(?![\p{L}])/giu, dot: 's.u.i.c.i.d.e', euphemism: 'unalive themselves' },
  { pattern: /(?<![\p{L}])self[\s-]?harm(?![\p{L}])/giu, dot: 's.e.l.f-h.a.r.m', euphemism: 'self-injury' },
  // death / killing
  { pattern: /(?<![\p{L}])killed(?![\p{L}])/giu, dot: 'k.i.l.l.e.d', euphemism: 'unalived' },
  { pattern: /(?<![\p{L}])killing(?![\p{L}])/giu, dot: 'k.i.l.l.i.n.g', euphemism: 'unaliving' },
  { pattern: /(?<![\p{L}])kill(?![\p{L}])/giu, dot: 'k.i.l.l', euphemism: 'unalive' },
  { pattern: /(?<![\p{L}])murder(?![\p{L}])/giu, dot: 'm.u.r.d.e.r', euphemism: 'unalive' },
  { pattern: /(?<![\p{L}])dead(?![\p{L}])/giu, dot: 'd.e.a.d', euphemism: 'no longer with us' },
  { pattern: /(?<![\p{L}])die(?![\p{L}])/giu, dot: 'd.i.e', euphemism: 'pass on' },
  { pattern: /(?<![\p{L}])died(?![\p{L}])/giu, dot: 'd.i.e.d', euphemism: 'passed on' },
  // drugs
  { pattern: /(?<![\p{L}])heroin(?![\p{L}])/giu, dot: 'h.e.r.o.i.n', euphemism: 'opiates' },
  { pattern: /(?<![\p{L}])cocaine(?![\p{L}])/giu, dot: 'c.o.c.a.i.n.e', euphemism: 'stimulants' },
  { pattern: /(?<![\p{L}])cannabis(?![\p{L}])/giu, dot: 'c.a.n.n.a.b.i.s', euphemism: 'gardening' },
  // violence / weapons
  { pattern: /(?<![\p{L}])gun(?![\p{L}])/giu, dot: 'g.u.n', euphemism: 'firearm' },
  { pattern: /(?<![\p{L}])shoot(?![\p{L}])/giu, dot: 's.h.o.o.t', euphemism: 'fire upon' },
  { pattern: /(?<![\p{L}])shooting(?![\p{L}])/giu, dot: 's.h.o.o.t.i.n.g', euphemism: 'gunfire incident' },
  { pattern: /(?<![\p{L}])bomb(?![\p{L}])/giu, dot: 'b.o.m.b', euphemism: 'explosive' },
  { pattern: /(?<![\p{L}])terrorist(?![\p{L}])/giu, dot: 't.e.r.r.o.r.i.s.t', euphemism: 'extremist' },
  { pattern: /(?<![\p{L}])terrorism(?![\p{L}])/giu, dot: 't.e.r.r.o.r.i.s.m', euphemism: 'extremism' },
  // adult
  { pattern: /(?<![\p{L}])porn(?![\p{L}])/giu, dot: 'p.o.r.n', euphemism: 'adult content' },
  { pattern: /(?<![\p{L}])nude(?![\p{L}])/giu, dot: 'n.u.d.e', euphemism: 'unclothed' },
  { pattern: /(?<![\p{L}])sexual assault(?![\p{L}])/giu, dot: 's.e.x.u.a.l a.s.s.a.u.l.t', euphemism: 'SA' },
]

/**
 * Tier-1 banned-hashtag block-list (Instagram). We won't auto-generate
 * these from titles, but we strip them defensively if a user-supplied
 * hashtag matches. Source: thepennymatters 2026 list — only the ones
 * a news / lifestyle pipeline might plausibly produce.
 *
 * Hashtags stored without the leading `#` for cheap lookup.
 */
const IG_BANNED_HASHTAGS = new Set([
  'alone', 'always', 'single', 'thought', 'beautyblogger', 'besties',
  'models', 'prettygirl', 'hardworkpaysoff', 'hustler', 'killingit',
  'dating', 'date', 'valentinesday', 'pushups', 'loseweight', 'swole',
  'bikinibody', 'kissing', 'hotweather', 'snapchat', 'snap', 'fuck',
  'shit', 'nasty', 'wtf', 'sexy', 'shower', 'undies', 'nude',
  'killallmen', 'selfharm', 'suicide', 'tựtử',
])

/**
 * Return the word-list registry for a given language.
 */
function listFor(language: SanitizeLanguage): WordEntry[] {
  return language === 'vi' ? VI_TIER1 : EN_TIER1
}

/**
 * Sanitize a caption against Tier-1 banned words.
 *
 * - `strategy: 'off'` returns the input unchanged with an empty
 *   replacements array.
 * - `strategy: 'dot'` rewrites each match to its dot-inserted form.
 * - `strategy: 'euphemism'` rewrites to the natural-language alternative.
 *
 * Replacements are collected with their position in the ORIGINAL
 * string, not the rewritten one — that's the useful coordinate for the
 * UI ("show me what was changed at offset N"). Case is preserved for
 * the matched substring in the `from` field, but the rewritten form
 * always uses the canonical lowercase from the word list (uppercase /
 * mixed-case originals come back lowercased — acceptable for caption
 * text, which is rarely capitalised anyway).
 */
export function sanitizeCaption(
  text: string,
  language: SanitizeLanguage,
  strategy: SanitizeStrategy
): SanitizeResult {
  if (strategy === 'off' || !text) {
    return { text, replacements: [] }
  }
  const entries = listFor(language)
  const replacements: SanitizeReplacement[] = []

  // We rebuild the output incrementally so multiple regex passes don't
  // interfere with each other's match indices. For each entry, walk
  // the CURRENT working text, record matches, then rewrite. Because
  // dot/euphemism replacements never produce a string that re-matches
  // the same entry (e.g. "c.h.ế.t" doesn't contain "chết"), this is
  // safe to run sequentially.
  let working = text
  let offsetShift = 0 // ORIGINAL → current index delta from prior rewrites

  for (const entry of entries) {
    entry.pattern.lastIndex = 0
    const replacement = strategy === 'dot' ? entry.dot : entry.euphemism
    let result = ''
    let lastIndex = 0
    let match: RegExpExecArray | null
    let localShift = 0
    while ((match = entry.pattern.exec(working)) !== null) {
      const matched = match[0]!
      const startInWorking = match.index
      const startInOriginal = startInWorking - offsetShift - localShift
      replacements.push({ from: matched, to: replacement, index: startInOriginal })
      result += working.slice(lastIndex, startInWorking) + replacement
      lastIndex = startInWorking + matched.length
      localShift += replacement.length - matched.length
      // Avoid zero-length infinite loop (defensive — patterns above are
      // non-empty, so this can't actually fire).
      if (entry.pattern.lastIndex === match.index) entry.pattern.lastIndex++
    }
    result += working.slice(lastIndex)
    working = result
    offsetShift += localShift
  }

  // Sort replacements by their position in the original string so the
  // UI can render them in document order.
  replacements.sort((a, b) => a.index - b.index)

  return { text: working, replacements }
}

/**
 * Strip Instagram-banned hashtags from a list. Match is case-insensitive
 * and ignores the leading `#`. Returns the cleaned list plus the
 * dropped entries so callers can show "removed N banned tags" feedback.
 */
export function filterBannedHashtags(hashtags: string[]): {
  hashtags: string[]
  dropped: string[]
} {
  const out: string[] = []
  const dropped: string[] = []
  for (const tag of hashtags) {
    const bare = tag.replace(/^#/, '').toLowerCase()
    if (IG_BANNED_HASHTAGS.has(bare)) {
      dropped.push(tag)
    } else {
      out.push(tag)
    }
  }
  return { hashtags: out, dropped }
}

/**
 * Default sanitize strategy per platform. Pinned here (not in social.ts)
 * so the dialog UI and the caption generator stay in sync on what each
 * platform should do by default.
 *
 *   - TikTok / Instagram (Reels) / YouTube — dot. These three platforms
 *     have the most aggressive moderation and creators have settled on
 *     dot-insertion as the safest visual-marker.
 *   - Facebook — euphemism. Reading flow matters more on long-form FB;
 *     audience is older and finds dot-text jarring.
 */
export const DEFAULT_STRATEGY_BY_PLATFORM: Record<
  'tiktok' | 'facebook' | 'instagram' | 'youtube',
  SanitizeStrategy
> = {
  tiktok: 'dot',
  instagram: 'dot',
  youtube: 'dot',
  facebook: 'euphemism',
}
