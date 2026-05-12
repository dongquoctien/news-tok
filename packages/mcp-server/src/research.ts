import type { Language, TextStyle } from '@news-tok/shared/schema'
import { BUILT_IN_TEXT_STYLES, findTextStyle } from '@news-tok/shared/text-styles'

/**
 * researchProjectAesthetic — classify an article's topic + tone via cheap
 * keyword matching, then map to existing presets, a music mood, and SFX.
 *
 * Why keyword matching rather than an LLM call from inside the MCP server:
 *
 *   - Deterministic. Same article → same recommendation, every render.
 *   - Sub-millisecond. Node-only, no HTTP.
 *   - Testable without network. Fits the offline-first ethos of the repo.
 *
 * The Claude orchestrator in the terminal calls this tool right after
 * extractArticle and uses the result to seed `project.variants` and
 * `project.userTextStyles`. The orchestrator is free to override every
 * recommendation via AskUserQuestion — this tool is a strong default,
 * not a decision-maker.
 */

export type ToneTag =
  | 'tense'
  | 'urgent'
  | 'professional'
  | 'cyber'
  | 'warm'
  | 'calm'
  | 'energetic'
  | 'playful'
  | 'cinematic'
  | 'editorial'

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

type TopicProfile = {
  // Lowercased keywords matched against title + first 2000 chars of article.
  vi: string[]
  en: string[]
  toneTags: ToneTag[]
  variantPicks: Array<{ id: 'A' | 'B' | 'C'; label: string; styleBySceneKind: Record<string, string> }>
  musicMoods: string[] // first one is the default, rest are fallbacks
  // Colour palette pinned to this topic, used to mint user styles when no
  // built-in fits the article well.
  palette: { primary: string; accent: string; ink: string }
}

const TOPIC_PROFILES: Record<Exclude<Topic, 'generic'>, TopicProfile> = {
  crime: {
    vi: ['án', 'tội phạm', 'cướp', 'giết', 'lừa đảo', 'bắt giữ', 'điều tra', 'khởi tố', 'vụ án', 'tử vong', 'tai nạn'],
    en: ['crime', 'arrest', 'fraud', 'robbery', 'murder', 'police', 'court', 'criminal', 'killed', 'accident'],
    toneTags: ['tense', 'urgent'],
    variantPicks: [
      { id: 'A', label: 'Breaking news', styleBySceneKind: { title: 'breaking-red', keypoint: 'crime-red', outro: 'cinematic' } },
      { id: 'B', label: 'Stark bold', styleBySceneKind: { title: 'bold-news', keypoint: 'crime-red', outro: 'outro-glow' } },
      { id: 'C', label: 'Editorial', styleBySceneKind: { title: 'editorial-serif', keypoint: 'news-ticker', outro: 'cinematic' } },
    ],
    musicMoods: ['tense', 'dramatic', 'cinematic'],
    palette: { primary: '#7f1d1d', accent: '#fef2f2', ink: '#0b0b0f' },
  },
  finance: {
    vi: ['bitcoin', 'btc', 'chứng khoán', 'cổ phiếu', 'tiền số', 'crypto', 'tỷ giá', 'lãi suất', 'ngân hàng', 'tài chính', 'doanh thu', 'lợi nhuận', 'thị trường'],
    en: ['bitcoin', 'crypto', 'stock', 'market', 'finance', 'bank', 'wall street', 'nasdaq', 'btc', 'eth', 'investor', 'earnings'],
    toneTags: ['urgent', 'professional'],
    variantPicks: [
      { id: 'A', label: 'Finance gold', styleBySceneKind: { title: 'finance-gold', keypoint: 'finance-gold', outro: 'outro-glow' } },
      { id: 'B', label: 'Bold news', styleBySceneKind: { title: 'bold-news', keypoint: 'news-ticker', outro: 'cinematic' } },
      { id: 'C', label: 'Cinematic', styleBySceneKind: { title: 'editorial-serif', keypoint: 'wordhighlight-mint', outro: 'cinematic' } },
    ],
    musicMoods: ['tense electronic', 'corporate', 'cinematic'],
    palette: { primary: '#fde047', accent: '#0b0b0f', ink: '#1c1917' },
  },
  tech: {
    vi: ['ai', 'iphone', 'android', 'macos', 'apple', 'google', 'phần mềm', 'công nghệ', 'startup', 'chatgpt', 'thuật toán', 'bảo mật', 'mã độc', 'cập nhật'],
    en: ['ai', 'iphone', 'android', 'macos', 'apple', 'google', 'software', 'tech', 'startup', 'chatgpt', 'algorithm', 'security', 'malware', 'update'],
    toneTags: ['cyber', 'professional'],
    variantPicks: [
      { id: 'A', label: 'Tech cyan', styleBySceneKind: { title: 'tech-cyan', keypoint: 'tech-cyan', outro: 'cinematic' } },
      { id: 'B', label: 'Cyber edge', styleBySceneKind: { title: 'cyberpunk-glitch', keypoint: 'neon-cyan', outro: 'outro-glow' } },
      { id: 'C', label: 'Clean classic', styleBySceneKind: { title: 'classic', keypoint: 'news-ticker', outro: 'cinematic' } },
    ],
    musicMoods: ['cinematic', 'electronic', 'tense'],
    palette: { primary: '#67e8f9', accent: '#0b0b0f', ink: '#0b0b0f' },
  },
  health: {
    vi: ['sức khỏe', 'bệnh', 'covid', 'y tế', 'vaccine', 'thuốc', 'dinh dưỡng', 'bệnh viện', 'bác sĩ', 'nghiên cứu', 'tế bào'],
    en: ['health', 'disease', 'covid', 'medical', 'vaccine', 'medicine', 'nutrition', 'hospital', 'doctor', 'study', 'cell'],
    toneTags: ['calm', 'professional'],
    variantPicks: [
      { id: 'A', label: 'Wellness mint', styleBySceneKind: { title: 'wellness-mint', keypoint: 'wellness-mint', outro: 'cinematic' } },
      { id: 'B', label: 'Editorial calm', styleBySceneKind: { title: 'editorial-serif', keypoint: 'wordhighlight-mint', outro: 'outro-glow' } },
      { id: 'C', label: 'Clean classic', styleBySceneKind: { title: 'classic', keypoint: 'news-ticker', outro: 'cinematic' } },
    ],
    musicMoods: ['calm', 'ambient', 'cinematic'],
    palette: { primary: '#0f766e', accent: '#ecfdf5', ink: '#0b0b0f' },
  },
  sports: {
    vi: ['bóng đá', 'thể thao', 'cầu thủ', 'huấn luyện viên', 'world cup', 'sea games', 'vô địch', 'tỉ số', 'trận đấu', 'chung kết', 'ronaldo', 'messi'],
    en: ['football', 'soccer', 'sport', 'player', 'coach', 'world cup', 'champion', 'match', 'final', 'ronaldo', 'messi', 'basketball'],
    toneTags: ['energetic'],
    variantPicks: [
      { id: 'A', label: 'Sports yellow', styleBySceneKind: { title: 'sports-yellow', keypoint: 'sports-yellow', outro: 'outro-glow' } },
      { id: 'B', label: 'Bebas impact', styleBySceneKind: { title: 'bebas-impact', keypoint: 'hormozi-yellow', outro: 'cinematic' } },
      { id: 'C', label: 'TikTok caption', styleBySceneKind: { title: 'gradient-pop', keypoint: 'tiktok-caption', outro: 'cinematic' } },
    ],
    musicMoods: ['energetic', 'rock', 'cinematic'],
    palette: { primary: '#fde047', accent: '#0b0b0f', ink: '#0b0b0f' },
  },
  entertainment: {
    vi: ['phim', 'ca sĩ', 'diễn viên', 'nghệ sĩ', 'mv', 'showbiz', 'điện ảnh', 'album', 'concert', 'liveshow', 'sao việt', 'sao hàn'],
    en: ['movie', 'film', 'singer', 'actor', 'actress', 'showbiz', 'cinema', 'album', 'concert', 'celebrity', 'star'],
    toneTags: ['playful', 'cinematic'],
    variantPicks: [
      { id: 'A', label: 'Entertainment pink', styleBySceneKind: { title: 'entertainment-pink', keypoint: 'entertainment-pink', outro: 'outro-glow' } },
      { id: 'B', label: 'Gradient pop', styleBySceneKind: { title: 'gradient-pop', keypoint: 'tiktok-caption', outro: 'cinematic' } },
      { id: 'C', label: 'Cinematic editorial', styleBySceneKind: { title: 'editorial-serif', keypoint: 'wordhighlight-mint', outro: 'cinematic' } },
    ],
    musicMoods: ['cinematic', 'epic', 'uplifting'],
    palette: { primary: '#f472b6', accent: '#fce7f3', ink: '#9d174d' },
  },
  lifestyle: {
    vi: ['xu hướng', 'phong cách', 'thời trang', 'cá nhân', 'làm đẹp', 'shopping', 'mua sắm'],
    en: ['lifestyle', 'trend', 'fashion', 'personal', 'beauty', 'shopping', 'style', 'aesthetic'],
    toneTags: ['warm', 'playful'],
    variantPicks: [
      { id: 'A', label: 'Lifestyle orange', styleBySceneKind: { title: 'lifestyle-orange', keypoint: 'lifestyle-orange', outro: 'cinematic' } },
      { id: 'B', label: 'Playful bubble', styleBySceneKind: { title: 'playful-bubble', keypoint: 'tiktok-caption', outro: 'outro-glow' } },
      { id: 'C', label: 'Editorial', styleBySceneKind: { title: 'editorial-serif', keypoint: 'news-ticker', outro: 'cinematic' } },
    ],
    musicMoods: ['uplifting', 'happy', 'cinematic'],
    palette: { primary: '#ea580c', accent: '#fff7ed', ink: '#7c2d12' },
  },
  travel: {
    vi: ['du lịch', 'điểm đến', 'check in', 'kì nghỉ', 'biển', 'núi', 'resort', 'khách sạn', 'hộ chiếu'],
    en: ['travel', 'destination', 'vacation', 'beach', 'mountain', 'resort', 'hotel', 'passport', 'tourism'],
    toneTags: ['warm', 'cinematic'],
    variantPicks: [
      { id: 'A', label: 'Lifestyle orange', styleBySceneKind: { title: 'lifestyle-orange', keypoint: 'lifestyle-orange', outro: 'cinematic' } },
      { id: 'B', label: 'Nature green', styleBySceneKind: { title: 'nature-green', keypoint: 'wellness-mint', outro: 'cinematic' } },
      { id: 'C', label: 'Cinematic', styleBySceneKind: { title: 'editorial-serif', keypoint: 'wordhighlight-mint', outro: 'cinematic' } },
    ],
    musicMoods: ['uplifting', 'cinematic', 'happy'],
    palette: { primary: '#0ea5e9', accent: '#f0f9ff', ink: '#0c4a6e' },
  },
  food: {
    vi: ['món ăn', 'ẩm thực', 'nhà hàng', 'đầu bếp', 'công thức', 'nấu ăn', 'phở', 'bánh mì'],
    en: ['food', 'cuisine', 'restaurant', 'chef', 'recipe', 'cook', 'cooking', 'dish', 'meal'],
    toneTags: ['warm', 'playful'],
    variantPicks: [
      { id: 'A', label: 'Lifestyle orange', styleBySceneKind: { title: 'lifestyle-orange', keypoint: 'lifestyle-orange', outro: 'cinematic' } },
      { id: 'B', label: 'Playful bubble', styleBySceneKind: { title: 'playful-bubble', keypoint: 'tiktok-caption', outro: 'outro-glow' } },
      { id: 'C', label: 'Editorial', styleBySceneKind: { title: 'editorial-serif', keypoint: 'news-ticker', outro: 'cinematic' } },
    ],
    musicMoods: ['happy', 'uplifting', 'cinematic'],
    palette: { primary: '#ea580c', accent: '#fff7ed', ink: '#7c2d12' },
  },
  nature: {
    vi: ['môi trường', 'thiên nhiên', 'rừng', 'biển', 'biến đổi khí hậu', 'động vật', 'sinh thái', 'tái chế'],
    en: ['environment', 'nature', 'forest', 'ocean', 'climate', 'wildlife', 'ecosystem', 'recycle', 'sustainability'],
    toneTags: ['calm', 'cinematic'],
    variantPicks: [
      { id: 'A', label: 'Nature green', styleBySceneKind: { title: 'nature-green', keypoint: 'nature-green', outro: 'cinematic' } },
      { id: 'B', label: 'Editorial calm', styleBySceneKind: { title: 'editorial-serif', keypoint: 'wellness-mint', outro: 'outro-glow' } },
      { id: 'C', label: 'Classic', styleBySceneKind: { title: 'classic', keypoint: 'news-ticker', outro: 'cinematic' } },
    ],
    musicMoods: ['ambient', 'calm', 'cinematic'],
    palette: { primary: '#166534', accent: '#ecfdf5', ink: '#0b0b0f' },
  },
  politics: {
    vi: ['chính phủ', 'thủ tướng', 'quốc hội', 'bộ trưởng', 'tổng thống', 'chính sách', 'pháp luật', 'bầu cử'],
    en: ['government', 'prime minister', 'parliament', 'minister', 'president', 'policy', 'law', 'election', 'congress'],
    toneTags: ['professional', 'editorial'],
    variantPicks: [
      { id: 'A', label: 'Editorial serif', styleBySceneKind: { title: 'editorial-serif', keypoint: 'news-ticker', outro: 'cinematic' } },
      { id: 'B', label: 'Bold news', styleBySceneKind: { title: 'bold-news', keypoint: 'classic', outro: 'outro-glow' } },
      { id: 'C', label: 'Classic', styleBySceneKind: { title: 'classic', keypoint: 'news-ticker', outro: 'cinematic' } },
    ],
    musicMoods: ['corporate', 'cinematic', 'news'],
    palette: { primary: '#1e3a8a', accent: '#dbeafe', ink: '#0b0b0f' },
  },
  education: {
    vi: ['giáo dục', 'học sinh', 'sinh viên', 'đại học', 'trường', 'thi cử', 'kiến thức', 'sách'],
    en: ['education', 'student', 'university', 'school', 'exam', 'knowledge', 'book', 'learn'],
    toneTags: ['professional', 'calm'],
    variantPicks: [
      { id: 'A', label: 'Classic', styleBySceneKind: { title: 'classic', keypoint: 'classic', outro: 'cinematic' } },
      { id: 'B', label: 'Editorial', styleBySceneKind: { title: 'editorial-serif', keypoint: 'wordhighlight-mint', outro: 'outro-glow' } },
      { id: 'C', label: 'Typewriter', styleBySceneKind: { title: 'classic', keypoint: 'typewriter-mono', outro: 'cinematic' } },
    ],
    musicMoods: ['calm', 'ambient', 'cinematic'],
    palette: { primary: '#0369a1', accent: '#e0f2fe', ink: '#0b0b0f' },
  },
}

function classifyTopic(haystack: string, language: Language): { topic: Topic; hits: number } {
  let best: Topic = 'generic'
  let bestHits = 0
  for (const [topic, profile] of Object.entries(TOPIC_PROFILES) as Array<[Topic, TopicProfile]>) {
    const keywords = language === 'vi' ? profile.vi : profile.en
    let hits = 0
    for (const k of keywords) {
      if (haystack.includes(k)) hits++
    }
    if (hits > bestHits) {
      bestHits = hits
      best = topic
    }
  }
  return { topic: best, hits: bestHits }
}

function genericPicks(): TopicProfile {
  return {
    vi: [],
    en: [],
    toneTags: ['editorial'],
    variantPicks: [
      { id: 'A', label: 'Classic', styleBySceneKind: { title: 'classic', keypoint: 'news-ticker', outro: 'cinematic' } },
      { id: 'B', label: 'Hormozi social', styleBySceneKind: { title: 'bold-news', keypoint: 'hormozi-yellow', outro: 'outro-glow' } },
      { id: 'C', label: 'Cinematic editorial', styleBySceneKind: { title: 'editorial-serif', keypoint: 'wordhighlight-mint', outro: 'cinematic' } },
    ],
    musicMoods: ['cinematic', 'corporate', 'calm'],
    palette: { primary: '#a5b4fc', accent: '#0b0b0f', ink: '#f4f4f6' },
  }
}

export type ResearchInput = {
  articleTitle: string
  articleText: string
  language: Language
  /** Pre-existing user styles to merge into the candidate pool. */
  userStyles?: TextStyle[]
  /** Set to true to ask the tool for one or two tailored userTextStyles. */
  proposeNewStyles?: boolean
}

export type ResearchOutput = {
  topic: Topic
  toneTags: ToneTag[]
  /** 1.0 = strong keyword match; 0 = no match, fell back to generic. */
  confidence: number
  variantPicks: Array<{
    id: 'A' | 'B' | 'C'
    label: string
    textStyleBySceneKind: Record<string, string>
  }>
  musicMood: string
  musicMoodFallbacks: string[]
  /**
   * Tailored TextStyles minted from the topic palette. Empty unless
   * proposeNewStyles=true OR confidence was strong but no built-in preset
   * matches the rationale closely. Caller should append to
   * project.userTextStyles before render.
   */
  newUserStyles: TextStyle[]
  rationale: string
}

function proposeStylesForTopic(topic: Topic, profile: TopicProfile, language: Language): TextStyle[] {
  if (topic === 'generic') return []
  const titleId = `${topic}-tailored-title`
  const keypointId = `${topic}-tailored-keypoint`
  const titleFont = language === 'vi' ? 'beVietnamPro' : 'montserrat'
  // Mint two styles: a strong title using the topic accent + ink, and a
  // keypoint that flips the relationship so the two layers read together.
  const styles: TextStyle[] = [
    {
      id: titleId,
      name: `${topic} (tailored title)`,
      family: profile.toneTags.includes('cinematic') ? 'cinematic' : profile.toneTags.includes('cyber') ? 'retro' : 'social',
      fontFamily: titleFont,
      fontSize: 92,
      fontWeight: 900,
      letterSpacing: -1,
      lineHeight: 1.05,
      color: profile.palette.accent,
      textStroke: { widthPx: 6, color: profile.palette.ink },
      textShadow: { blur: 0, color: profile.palette.ink, offsetX: 0, offsetY: 6 },
      background: { kind: 'none' },
      align: 'center',
      anchor: 'middle',
      marginPct: 8,
      enter: profile.toneTags.includes('cyber') ? 'glitch' : profile.toneTags.includes('cinematic') ? 'maskWipe' : 'slideUp',
      exit: 'fade',
      enterDurationSec: 0.5,
      exitDurationSec: 0.4,
      sfx: { enterSoundId: 'whoosh-short', enterVolume: 0.55, perWordVolume: 0.4 },
      source: 'user',
      scope: ['title'],
    },
    {
      id: keypointId,
      name: `${topic} (tailored keypoint)`,
      family: profile.toneTags.includes('cinematic') ? 'cinematic' : 'social',
      fontFamily: titleFont,
      fontSize: 72,
      fontWeight: 800,
      letterSpacing: -0.5,
      lineHeight: 1.15,
      color: profile.palette.accent,
      textShadow: { blur: 20, color: profile.palette.ink, offsetX: 0, offsetY: 4 },
      background: { kind: 'solid', color: profile.palette.primary, paddingPct: 2.8, radiusPx: 10, opacity: 0.92 },
      align: 'left',
      anchor: 'bottom',
      marginPct: 8,
      enter: 'slideUp',
      exit: 'fade',
      enterDurationSec: 0.4,
      exitDurationSec: 0.4,
      source: 'user',
      scope: ['keypoint'],
    },
  ]
  return styles
}

export function researchProjectAesthetic(input: ResearchInput): ResearchOutput {
  const haystack = (input.articleTitle + ' ' + input.articleText)
    .slice(0, 4000)
    .toLowerCase()
  const { topic, hits } = classifyTopic(haystack, input.language)
  const profile = topic === 'generic' ? genericPicks() : TOPIC_PROFILES[topic as Exclude<Topic, 'generic'>]

  // Verify each suggested preset id resolves — fall back to 'classic' for
  // ids missing from the current registry (defensive against renames).
  const userStylesPool = input.userStyles ?? []
  const variantPicks = profile.variantPicks.map((v) => ({
    id: v.id,
    label: v.label,
    textStyleBySceneKind: Object.fromEntries(
      Object.entries(v.styleBySceneKind).map(([scene, styleId]) => {
        const resolved = findTextStyle(styleId, userStylesPool) ?? findTextStyle('classic', userStylesPool)
        return [scene, resolved?.id ?? 'classic']
      })
    ),
  }))

  const newUserStyles =
    input.proposeNewStyles && topic !== 'generic'
      ? proposeStylesForTopic(topic, profile, input.language)
      : []

  // Confidence: 3+ keyword hits → 1.0; 1-2 hits → linear; 0 hits → 0.
  const confidence = hits >= 3 ? 1 : hits === 0 ? 0 : hits / 3

  const presetCount = BUILT_IN_TEXT_STYLES.length + userStylesPool.length
  const rationale =
    topic === 'generic'
      ? `No clear topic keywords matched (${input.language}). Falling back to the default trio (Classic / Hormozi social / Cinematic editorial) and the 'cinematic' music mood. Considered ${presetCount} known presets.`
      : `Topic '${topic}' detected via ${hits} keyword hit${hits === 1 ? '' : 's'} (${input.language}). Tone tags: ${profile.toneTags.join(', ')}. Variants pinned to the '${topic}' look, music mood '${profile.musicMoods[0]}', SFX bound through the presets' built-in cues.`

  return {
    topic,
    toneTags: profile.toneTags,
    confidence,
    variantPicks,
    musicMood: profile.musicMoods[0] ?? 'cinematic',
    musicMoodFallbacks: profile.musicMoods.slice(1),
    newUserStyles,
    rationale,
  }
}
