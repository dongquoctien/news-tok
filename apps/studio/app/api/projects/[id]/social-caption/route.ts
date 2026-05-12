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
 * GET /api/projects/[id]/social-caption?topic=<optional>
 *
 * Returns 3 platform-tailored caption variants (TikTok / Facebook /
 * Instagram) plus a topic-aware hashtag block. Mirrors the MCP tool
 * `generateSocialCaption` so the Studio UI and the AI orchestrator
 * surface identical output.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const topicParam = req.nextUrl.searchParams.get('topic')
    const topic =
      topicParam && (VALID_TOPICS as string[]).includes(topicParam)
        ? (topicParam as Topic)
        : undefined
    const project = await readStoryboard(params.id)
    const result = generateSocialCaptions({ project, topic })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.toLowerCase().includes('enoent') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
