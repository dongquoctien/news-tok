/**
 * Generate platform-tailored social-media captions + hashtags from a
 * project storyboard. 100% local — no LLM call. The captions are built
 * from segment.text using a small set of templates per platform; the
 * hashtag set is the union of a topic-aware pool and a few evergreen
 * trending tags for Vietnamese audiences.
 *
 * Four variants are returned every call:
 *   - tiktok    short hook + 3-5 lines + tight hashtag tail (≤2200 chars)
 *   - facebook  narrative — opens with the headline, weaves keypoints,
 *               ends with a CTA. Hashtags on the last line.
 *   - instagram emoji-heavy hook + line-broken keypoints + dense hashtag
 *               block (Instagram caps captions at 2200 chars / 30 tags).
 *   - youtube   SEO-first: keyword-rich hook in the first 100 chars,
 *               2-3 paragraph body, sparse hashtags (YouTube only
 *               surfaces the first 3 below the title; the rest live
 *               in the description body).
 *
 * Each generated caption is passed through `sanitizeCaption` with the
 * platform's default strategy (TikTok / IG / YT → dot, FB → euphemism)
 * to mask Tier-1 hard-ban words. Callers wanting raw text should pass
 * `sanitize: 'off'` per platform via the options argument.
 */

import type { Project, Language } from './schema.js'
import {
  DEFAULT_STRATEGY_BY_PLATFORM,
  filterBannedHashtags,
  sanitizeCaption,
  type SanitizeReplacement,
  type SanitizeStrategy,
} from './caption-sanitize.js'

/**
 * Topic taxonomy — mirrors the one in mcp-server/research.ts. Kept here
 * so social.ts is self-contained and Studio can call into it without
 * dragging in the mcp-server bundle.
 */
export type Topic =
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

/**
 * Mini keyword pools (vi + en) for auto-classification when the caller
 * doesn't pin a topic. Each pool is ~6-8 high-signal terms — the lite
 * version of mcp-server/research.ts's TOPIC_PROFILES. Good enough for
 * caption generation; research.ts stays the authority for variant
 * selection at project creation.
 */
const CLASSIFIER_VI: Record<Exclude<Topic, 'generic'>, string[]> = {
  crime: ['án', 'tội phạm', 'bắt giữ', 'ma túy', 'điều tra', 'cướp', 'giết'],
  finance: ['chứng khoán', 'cổ phiếu', 'đầu tư', 'lãi suất', 'crypto', 'bitcoin'],
  tech: ['công nghệ', 'ai', 'app', 'phần mềm', 'iphone', 'macos'],
  health: ['sức khỏe', 'bệnh', 'vắc xin', 'điều trị', 'dinh dưỡng'],
  sports: ['bóng đá', 'thể thao', 'vô địch', 'huấn luyện', 'cầu thủ'],
  entertainment: ['ca sĩ', 'diễn viên', 'showbiz', 'phim', 'mv', 'concert'],
  lifestyle: ['lối sống', 'phong cách', 'thời trang', 'trend'],
  travel: ['du lịch', 'điểm đến', 'khám phá', 'tour'],
  food: ['ẩm thực', 'món ăn', 'quán', 'nhà hàng', 'công thức'],
  nature: ['thiên nhiên', 'khí hậu', 'môi trường', 'động vật'],
  politics: ['chính phủ', 'thủ tướng', 'bộ trưởng', 'quốc hội', 'chính sách'],
  education: ['học sinh', 'sinh viên', 'giáo dục', 'kỳ thi', 'đại học'],
}

const CLASSIFIER_EN: Record<Exclude<Topic, 'generic'>, string[]> = {
  crime: ['crime', 'arrest', 'police', 'investigation', 'fraud', 'murder'],
  finance: ['stock', 'market', 'investor', 'crypto', 'bitcoin', 'finance'],
  tech: ['tech', 'ai', 'app', 'software', 'iphone', 'macos'],
  health: ['health', 'disease', 'vaccine', 'treatment', 'nutrition'],
  sports: ['football', 'soccer', 'sport', 'championship', 'athlete'],
  entertainment: ['singer', 'actor', 'celebrity', 'film', 'movie', 'concert'],
  lifestyle: ['lifestyle', 'fashion', 'trend', 'wellness'],
  travel: ['travel', 'destination', 'tour', 'explore'],
  food: ['food', 'restaurant', 'recipe', 'cuisine'],
  nature: ['nature', 'climate', 'environment', 'wildlife'],
  politics: ['government', 'minister', 'congress', 'policy', 'election'],
  education: ['student', 'education', 'school', 'university', 'exam'],
}

/**
 * Auto-classify a project to one of the 13 topics. Used by
 * `generateSocialCaptions` when the caller didn't pin a topic. Same
 * word-boundary trick as research.ts so short tokens like 'ai' don't
 * bleed into 'said' or 'rain'.
 */
function classifyTopicLocal(haystack: string, language: Language): Topic {
  const lower = haystack.toLowerCase()
  const pool = language === 'vi' ? CLASSIFIER_VI : CLASSIFIER_EN
  let best: Topic = 'generic'
  let bestHits = 0
  for (const [topic, words] of Object.entries(pool) as Array<[Exclude<Topic, 'generic'>, string[]]>) {
    let hits = 0
    for (const w of words) {
      if (w.includes(' ')) {
        if (lower.includes(w)) hits++
      } else {
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu').test(lower)) hits++
      }
    }
    if (hits > bestHits) {
      bestHits = hits
      best = topic
    }
  }
  return best
}

// ── Topic → hashtag pool (Vietnamese-first; English fallback as backup) ──
const TOPIC_HASHTAGS_VI: Record<Topic, string[]> = {
  crime: ['#tintuc', '#antoan', '#phapluat', '#vuanmoinhat', '#anninh', '#showbizphapluat'],
  finance: ['#taichinh', '#dautu', '#chungkhoan', '#kinhte', '#tien', '#crypto'],
  tech: ['#congnghe', '#tinai', '#tech', '#xuhuong', '#ai', '#capnhatcongnghe'],
  health: ['#suckhoe', '#yhoc', '#chamsocsuckhoe', '#dinhduong', '#songkhoe'],
  sports: ['#thethao', '#bongda', '#vleague', '#worldcup', '#vothuat'],
  entertainment: ['#showbiz', '#giaitri', '#saoviet', '#vbiz', '#nghesi', '#celebrity'],
  lifestyle: ['#loisong', '#xuhuong', '#daily', '#vlog', '#chiase'],
  travel: ['#dulich', '#kham_pha', '#vietnam', '#travel', '#diaden'],
  food: ['#amthuc', '#monngon', '#review_doan', '#foodie', '#anuong'],
  nature: ['#thiennhien', '#moitruong', '#khihau', '#tindep', '#bien_dao'],
  politics: ['#chinhsach', '#thoisu', '#tintucvietnam', '#xahoi'],
  education: ['#hoctap', '#giaoduc', '#kynang', '#sinhvien', '#hocsinh'],
  generic: ['#tintuc', '#capnhat', '#thoisu', '#chiase'],
}

const TOPIC_HASHTAGS_EN: Record<Topic, string[]> = {
  crime: ['#breakingnews', '#crime', '#justice', '#truecrime', '#news'],
  finance: ['#finance', '#stocks', '#investing', '#crypto', '#money'],
  tech: ['#tech', '#ai', '#technology', '#startup', '#innovation'],
  health: ['#health', '#wellness', '#medicine', '#healthtips'],
  sports: ['#sports', '#football', '#soccer', '#athlete'],
  entertainment: ['#entertainment', '#celebrity', '#showbiz', '#pop'],
  lifestyle: ['#lifestyle', '#daily', '#routine', '#mindset'],
  travel: ['#travel', '#explore', '#vacation', '#wanderlust'],
  food: ['#food', '#foodie', '#recipe', '#cooking'],
  nature: ['#nature', '#environment', '#climate', '#wildlife'],
  politics: ['#politics', '#policy', '#news', '#current'],
  education: ['#education', '#learning', '#students', '#skills'],
  generic: ['#news', '#update', '#trending'],
}

// Evergreen high-reach tags layered on top of the topic pool.
const EVERGREEN_VI = ['#xuhuong', '#fyp', '#viral', '#tiktokvn']
const EVERGREEN_EN = ['#fyp', '#viral', '#trending', '#explore']

// YouTube-specific evergreen pool. YouTube only displays the first 3
// hashtags above the title — these are the highest-impact slots. The
// rest live in the body and act as SEO weight only.
const YOUTUBE_EVERGREEN_VI = ['#shorts', '#tintuc', '#vietnam']
const YOUTUBE_EVERGREEN_EN = ['#shorts', '#news', '#trending']

/** Pull the first N meaningful keywords out of the title (de-stopped). */
const STOPWORDS_VI = new Set([
  'là', 'và', 'của', 'cho', 'với', 'từ', 'đến', 'một', 'những', 'này', 'đó',
  'tại', 'trong', 'ngoài', 'sau', 'trước', 'khi', 'như', 'hay', 'hoặc', 'nhưng',
  'thì', 'cũng', 'đã', 'sẽ', 'đang', 'có', 'không', 'rồi', 'tin', 'tức',
])
const STOPWORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'from',
  'this', 'that', 'these', 'those', 'it', 'its', 'be', 'been', 'has',
  'have', 'will', 'would', 'can', 'could', 'should', 'into', 'out',
])

function extractKeywords(title: string, language: Language, max = 5): string[] {
  const stop = language === 'vi' ? STOPWORDS_VI : STOPWORDS_EN
  const tokens = title
    .toLowerCase()
    // Keep Unicode letters; drop punctuation.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w))
  // Preserve first-seen order; dedupe.
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tokens) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

function toHashtag(word: string): string {
  // Collapse to alphanum (mirrors how social platforms tokenise tags).
  return '#' + word.replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Build the hashtag block. Topic pool first, then keyword-derived tags,
 * then evergreen high-reach tags. Capped at 12 to leave room for the
 * user to append their own; Instagram cap of 30 is well within range.
 *
 * Pass `platform: 'youtube'` to use the YouTube-specific evergreen
 * pool (`#shorts` etc.) instead of the TikTok-friendly one. Other
 * platforms share the generic evergreen list.
 *
 * Banned-tag filter (Instagram block-list) runs at the end so a stray
 * generated tag like `#alone` doesn't poison the post's reach.
 */
function buildHashtags(
  topic: Topic,
  language: Language,
  title: string,
  platform: 'tiktok' | 'facebook' | 'instagram' | 'youtube'
): string[] {
  const topicPool = language === 'vi' ? TOPIC_HASHTAGS_VI[topic] : TOPIC_HASHTAGS_EN[topic]
  const evergreen =
    platform === 'youtube'
      ? language === 'vi'
        ? YOUTUBE_EVERGREEN_VI
        : YOUTUBE_EVERGREEN_EN
      : language === 'vi'
        ? EVERGREEN_VI
        : EVERGREEN_EN
  const kws = extractKeywords(title, language).map(toHashtag)
  const all = [...topicPool, ...kws, ...evergreen]
  const seen = new Set<string>()
  const out: string[] = []
  for (const h of all) {
    const key = h.toLowerCase()
    if (seen.has(key) || h.length < 3) continue
    seen.add(key)
    out.push(h)
    if (out.length >= 12) break
  }
  // Strip IG-banned hashtags defensively — `#alone`, `#killingit`, etc
  // get auto-generated from titles surprisingly often. The drop list
  // is shared across platforms because a tag banned on IG also tends
  // to underperform elsewhere.
  return filterBannedHashtags(out).hashtags
}

/** Pull a short hook (≤90 chars) from the title or first keypoint. */
function hookOf(title: string, segments: Project['segments']): string {
  const t = title.trim()
  if (t.length > 0 && t.length <= 90) return t
  if (t.length > 90) return t.slice(0, 87) + '...'
  const first = segments.find((s) => s.scene === 'title') ?? segments[0]
  return (first?.text ?? '').slice(0, 87) + (first?.text && first.text.length > 87 ? '...' : '')
}

/** Pull short keypoint bullets — up to 4 — for the body of the caption. */
function keypointsOf(segments: Project['segments'], max = 4): string[] {
  return segments
    .filter((s) => s.scene === 'keypoint')
    .slice(0, max)
    .map((s) => s.text.trim())
    .filter(Boolean)
}

/**
 * Compress a keypoint sentence to a short phrase. Splits on punctuation
 * and keeps the first clause. If the first clause is still too long, we
 * fall back to a hard truncate. Result is usually 8-15 Vietnamese words.
 *
 * The captions used to glue every full keypoint into the caption body
 * which made captions read like a transcript. Compressing each line to
 * its lead clause gives users a baseline that's already in the right
 * length neighbourhood — orchestrator (Claude) can still rewrite, but
 * the starting point isn't a wall of text.
 */
function compressKeypoint(text: string, maxChars = 70): string {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= maxChars) return cleaned
  // Try splitting on comma, semicolon, dash, or VN "—". Pick the first
  // clause if it falls inside our budget; otherwise hard-truncate.
  const clauses = cleaned.split(/[,;—–\-]\s+/)
  const first = clauses[0]
  if (first && first.length <= maxChars) return first
  return cleaned.slice(0, maxChars - 1).trimEnd() + '…'
}

/** Optional outro line — closing CTA from the storyboard if present. */
function outroOf(segments: Project['segments']): string | undefined {
  const out = segments.find((s) => s.scene === 'outro')
  return out?.text?.trim() || undefined
}

function tiktokCaption(
  hook: string,
  keypoints: string[],
  _outro: string | undefined,
  hashtags: string[],
  language: Language
): string {
  // TikTok sweet spot is 120–250 chars. Hook + ONE punch line + tiny
  // CTA + ≤6 hashtags. The hook isn't shouted (uppercase felt
  // shouty); the punch line is the lead clause of the most interesting
  // keypoint (the second one, since the first is usually setup).
  const punchSource = keypoints[1] ?? keypoints[0] ?? ''
  const punch = punchSource ? compressKeypoint(punchSource, 80) : ''
  const cta = language === 'vi' ? 'Theo dõi để xem thêm 👇' : 'Follow for more 👇'
  const body = punch ? [hook, punch, cta] : [hook, cta]
  return body.join('\n') + '\n\n' + hashtags.slice(0, 6).join(' ')
}

function facebookCaption(
  hook: string,
  keypoints: string[],
  outro: string | undefined,
  hashtags: string[],
  language: Language
): string {
  // Facebook sweet spot is 400–800 chars. Storytelling 2–3 paragraphs.
  // Open with the hook as a single line, then compress 2–3 keypoints
  // into one flowing paragraph (no numbered bullets — feels listicle).
  // Close with an open-ended question to invite comments.
  const compressedKps = keypoints.slice(0, 3).map((k) => compressKeypoint(k, 110))
  const para = compressedKps.join(language === 'vi' ? '. ' : '. ') +
    (compressedKps.length > 0 ? '.' : '')
  const cta =
    outro ??
    (language === 'vi'
      ? 'Bạn nghĩ sao về tin này? Để lại cảm nhận ở phần bình luận.'
      : 'What\'s your take? Drop a comment below.')
  // Layout: hook (paragraph break) story paragraph (paragraph break) cta
  // (paragraph break) hashtags.
  return [hook, '', para, '', cta, '', hashtags.slice(0, 8).join(' ')].join('\n')
}

function instagramCaption(
  hook: string,
  keypoints: string[],
  _outro: string | undefined,
  hashtags: string[],
  language: Language
): string {
  // Instagram sweet spot is 250–500 chars. Emoji-led hook, 2–3 short
  // arrow bullets, dense hashtag block separated by blank dots so it
  // collapses below the truncation fold. Keep bullets tight — the
  // baseline used to emit the full keypoint, which blew past the
  // sweet spot and made captions look spammy.
  const emoji = '✨'
  const intro = `${emoji} ${hook}`
  const bullets = keypoints.slice(0, 3).map((k) => `→ ${compressKeypoint(k, 60)}`)
  const cta =
    language === 'vi' ? '💬 Bình luận cảm nhận của bạn' : '💬 Drop a thought below'
  return [intro, '', ...bullets, '', cta, '', '.', '.', '.', hashtags.slice(0, 12).join(' ')].join('\n')
}

function youtubeCaption(
  hook: string,
  keypoints: string[],
  outro: string | undefined,
  hashtags: string[],
  language: Language
): string {
  // YouTube sweet spot for description is 1500–5000 chars. SEO matters
  // most in the first 100 chars (what shows above the fold) and in
  // the first hashtag (only 3 hashtags display above the title).
  //
  // Layout:
  //   line 1 — hook (keyword-dense, ≤ 100 chars)
  //   blank
  //   line 3..5 — 2–3 keypoint paragraphs (each one full sentence,
  //               not compressed — YouTube readers tolerate length
  //               and the algorithm reads the full body for indexing)
  //   blank
  //   line N-2 — outro / CTA (subscribe ask)
  //   blank
  //   line N — top-3 hashtags (display slot) — these are the only
  //            hashtags YT shows above the title
  //   line N+1 — remaining hashtags (SEO weight, hidden in description)
  const intro = hook
  const paras = keypoints.slice(0, 3).map((k) => k.trim())
  const cta =
    outro ??
    (language === 'vi'
      ? 'Đăng ký kênh để cập nhật những tin mới nhất 🔔'
      : 'Subscribe for more daily news 🔔')
  const topTags = hashtags.slice(0, 3).join(' ')
  const restTags = hashtags.slice(3).join(' ')
  const lines = [intro, '', ...paras.flatMap((p) => [p, '']), cta, '', topTags]
  if (restTags) lines.push('', restTags)
  return lines.join('\n')
}

export type Platform = 'tiktok' | 'facebook' | 'instagram' | 'youtube'

export type SocialCaption = {
  platform: Platform
  text: string
  charCount: number
  /**
   * Words that were rewritten by the sanitizer (Tier-1 hard-ban
   * masking). Empty when sanitize is `'off'` or no Tier-1 words
   * appeared. Surface in the UI as a "5 words masked" badge so the
   * user can decide whether to copy / further edit.
   */
  sanitizeReplacements: SanitizeReplacement[]
}

export type SocialCaptionResult = {
  topic: Topic
  hashtags: string[]
  captions: SocialCaption[]
}

/**
 * Per-platform sanitize-strategy override. Pass to disable masking
 * on one platform (e.g. user already hand-edited the FB caption) or
 * force a specific strategy (e.g. dot on Facebook for a known
 * sensitive story). When a platform key is omitted, the default
 * from `DEFAULT_STRATEGY_BY_PLATFORM` is used.
 */
export type SanitizeOverrides = Partial<Record<Platform, SanitizeStrategy>>

export function generateSocialCaptions(input: {
  project: Project
  /**
   * Optional pin. When omitted, the function auto-classifies via a
   * lite keyword rule (title + first 2000 chars of concatenated
   * segment text). Pass an explicit topic when the article straddles
   * two categories.
   */
  topic?: Topic
  /**
   * Optional per-platform sanitize override. When omitted, each
   * platform uses its research-backed default (TikTok / IG / YT →
   * dot, FB → euphemism). Pass `{ facebook: 'off' }` to leave FB
   * untouched, or `{ tiktok: 'euphemism' }` to swap strategies.
   */
  sanitize?: SanitizeOverrides
}): SocialCaptionResult {
  const { project, sanitize: overrides = {} } = input
  const topic =
    input.topic ??
    classifyTopicLocal(
      `${project.title}\n${project.segments.map((s) => s.text).join('\n').slice(0, 2000)}`,
      project.language
    )

  const hook = hookOf(project.title, project.segments)
  const keypoints = keypointsOf(project.segments)
  const outro = outroOf(project.segments)

  // Hashtag pool is platform-aware (YouTube uses #shorts / #news, the
  // others share the TikTok-friendly pool). Generated separately per
  // platform so we don't smear a single set across all four.
  const platforms: Platform[] = ['tiktok', 'facebook', 'instagram', 'youtube']
  const captions: SocialCaption[] = []
  for (const platform of platforms) {
    const tags = buildHashtags(topic, project.language, project.title, platform)
    const raw =
      platform === 'tiktok'
        ? tiktokCaption(hook, keypoints, outro, tags, project.language)
        : platform === 'facebook'
          ? facebookCaption(hook, keypoints, outro, tags, project.language)
          : platform === 'instagram'
            ? instagramCaption(hook, keypoints, outro, tags, project.language)
            : youtubeCaption(hook, keypoints, outro, tags, project.language)
    const strategy = overrides[platform] ?? DEFAULT_STRATEGY_BY_PLATFORM[platform]
    const sanitized = sanitizeCaption(raw, project.language, strategy)
    captions.push({
      platform,
      text: sanitized.text,
      charCount: sanitized.text.length,
      sanitizeReplacements: sanitized.replacements,
    })
  }

  // The top-level `hashtags` field is the TikTok-style pool (most
  // callers want the generic one to display alongside the captions).
  // Per-platform hashtag pools live inside the caption.text already.
  const hashtags = buildHashtags(topic, project.language, project.title, 'tiktok')

  return { topic, hashtags, captions }
}
