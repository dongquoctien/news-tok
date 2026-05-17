import { NextResponse, type NextRequest } from 'next/server'
import { readStoryboard } from '@news-tok/render'
import { generateSocialCaptions, type Topic } from '@news-tok/shared/social'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TOPICS: Topic[] = [
  'crime',
  'finance',
  'tech',
  'health',
  'sports',
  'entertainment',
  'lifestyle',
  'travel',
  'food',
  'nature',
  'politics',
  'education',
  'generic',
]

/**
 * GET /api/projects/[id]/social-caption?topic=<optional>&force=template
 *
 * Returns 4 platform-tailored caption variants (TikTok / Facebook /
 * Instagram / YouTube) plus a topic-aware hashtag block.
 *
 * Strategy:
 *   1. If `project.socialCaptions` exists (written by Claude CLI via
 *      the `rewriteSocialCaptions` MCP tool), return that cache with
 *      `source: 'llm-rewrite'` so the dialog can badge it.
 *   2. Otherwise fall back to the local template
 *      (`generateSocialCaptions`) — mirrors the legacy behaviour.
 *
 * Pass `?force=template` to skip the cache and always return the
 * template — used by the refresh flow to compare LLM output against
 * baseline.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const topicParam = req.nextUrl.searchParams.get('topic')
    const forceTemplate = req.nextUrl.searchParams.get('force') === 'template'
    const topic =
      topicParam && (VALID_TOPICS as string[]).includes(topicParam)
        ? (topicParam as Topic)
        : undefined
    const project = await readStoryboard(params.id)
    if (!forceTemplate && project.socialCaptions) {
      // Cache hit — Claude CLI has already written rewritten captions.
      // Shape matches what generateSocialCaptions() would return so
      // SocialCaptionDialog doesn't need a separate code path.
      const cache = project.socialCaptions
      return NextResponse.json({
        topic: cache.topic,
        hashtags: cache.hashtags,
        captions: cache.captions.map((c) => ({
          platform: c.platform,
          text: c.text,
          charCount: c.charCount,
          sanitizeReplacements: [],
        })),
        source: cache.source,
        generatedAt: cache.generatedAt,
      })
    }
    const result = generateSocialCaptions({ project, topic })
    return NextResponse.json({ ...result, source: 'template' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.toLowerCase().includes('enoent') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
