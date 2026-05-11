import { NextResponse, type NextRequest } from 'next/server'
import { crawler } from '@news-tok/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const query = sp.get('q')
  if (!query) {
    return NextResponse.json({ error: 'missing ?q' }, { status: 400 })
  }
  const orientation = sp.get('orientation') as 'landscape' | 'portrait' | 'square' | null
  // Video has no API providers in this repo — always crawl. Default to Pexels.
  const provider = sp.get('provider')?.replace(/^crawl:/, '') ?? 'pexels-video'

  try {
    const asset = await crawler.crawlVideo({
      provider,
      params: { query, orientation: orientation ?? undefined },
    })
    return NextResponse.json({ asset })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message, provider }, { status: 500 })
  }
}
