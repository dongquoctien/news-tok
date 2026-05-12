/**
 * Generate platform-tailored social-media captions + hashtags from a
 * project storyboard. 100% local — no LLM call. The captions are built
 * from segment.text using a small set of templates per platform; the
 * hashtag set is the union of a topic-aware pool and a few evergreen
 * trending tags for Vietnamese audiences.
 *
 * Three variants are returned every call:
 *   - tiktok   short hook + 3-5 lines + tight hashtag tail (≤2200 chars)
 *   - facebook narrative — opens with the headline, weaves keypoints,
 *              ends with a CTA. Hashtags on the last line.
 *   - instagram emoji-heavy hook + line-broken keypoints + dense hashtag
 *               block (Instagram caps captions at 2200 chars / 30 tags).
 */

import type { Project, Language } from './schema.js'

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
 */
function buildHashtags(
  topic: Topic,
  language: Language,
  title: string
): string[] {
  const topicPool = language === 'vi' ? TOPIC_HASHTAGS_VI[topic] : TOPIC_HASHTAGS_EN[topic]
  const evergreen = language === 'vi' ? EVERGREEN_VI : EVERGREEN_EN
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
  return out
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

/** Optional outro line — closing CTA from the storyboard if present. */
function outroOf(segments: Project['segments']): string | undefined {
  const out = segments.find((s) => s.scene === 'outro')
  return out?.text?.trim() || undefined
}

function tiktokCaption(
  hook: string,
  keypoints: string[],
  outro: string | undefined,
  hashtags: string[],
  language: Language
): string {
  // TikTok rewards tight, hook-first captions. Three short lines max.
  const cta = outro ?? (language === 'vi' ? 'Theo dõi để cập nhật.' : 'Follow for more.')
  const bullets = keypoints.slice(0, 2).map((k) => '• ' + (k.length > 100 ? k.slice(0, 97) + '...' : k))
  const lines = [hook.toUpperCase(), ...bullets, cta]
  return lines.join('\n') + '\n\n' + hashtags.slice(0, 8).join(' ')
}

function facebookCaption(
  hook: string,
  keypoints: string[],
  outro: string | undefined,
  hashtags: string[],
  language: Language
): string {
  // Facebook captions can be long; tell a mini-story.
  const intro = hook
  const bodyLines = keypoints.map((k, i) => `${i + 1}. ${k}`)
  const cta =
    outro ??
    (language === 'vi'
      ? 'Bạn nghĩ gì? Để lại bình luận bên dưới và đừng quên chia sẻ.'
      : 'What do you think? Leave a comment and share if you found this useful.')
  return [intro, '', ...bodyLines, '', cta, '', hashtags.slice(0, 10).join(' ')].join('\n')
}

function instagramCaption(
  hook: string,
  keypoints: string[],
  outro: string | undefined,
  hashtags: string[],
  language: Language
): string {
  // Instagram rewards emoji-led hooks + dense hashtag block at the end.
  const emoji = '✨'
  const intro = `${emoji} ${hook}`
  const bullets = keypoints.map((k) => `→ ${k}`)
  const cta = outro ?? (language === 'vi' ? '💬 Bình luận cảm nhận của bạn nhé.' : '💬 Tell us what you think.')
  return [intro, '', ...bullets, '', cta, '', '.', '.', '.', hashtags.join(' ')].join('\n')
}

export type SocialCaption = {
  platform: 'tiktok' | 'facebook' | 'instagram'
  text: string
  charCount: number
}

export type SocialCaptionResult = {
  topic: Topic
  hashtags: string[]
  captions: SocialCaption[]
}

export function generateSocialCaptions(input: {
  project: Project
  /**
   * Optional pin. When omitted, the function auto-classifies via a
   * lite keyword rule (title + first 2000 chars of concatenated
   * segment text). Pass an explicit topic when the article straddles
   * two categories.
   */
  topic?: Topic
}): SocialCaptionResult {
  const { project } = input
  const topic =
    input.topic ??
    classifyTopicLocal(
      `${project.title}\n${project.segments.map((s) => s.text).join('\n').slice(0, 2000)}`,
      project.language
    )
  const hashtags = buildHashtags(topic, project.language, project.title)
  const hook = hookOf(project.title, project.segments)
  const keypoints = keypointsOf(project.segments)
  const outro = outroOf(project.segments)

  const tiktok = tiktokCaption(hook, keypoints, outro, hashtags, project.language)
  const facebook = facebookCaption(hook, keypoints, outro, hashtags, project.language)
  const instagram = instagramCaption(hook, keypoints, outro, hashtags, project.language)

  return {
    topic,
    hashtags,
    captions: [
      { platform: 'tiktok', text: tiktok, charCount: tiktok.length },
      { platform: 'facebook', text: facebook, charCount: facebook.length },
      { platform: 'instagram', text: instagram, charCount: instagram.length },
    ],
  }
}
