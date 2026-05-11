import { NextResponse, type NextRequest } from 'next/server'
import { pexels, pixabay, unsplash } from '@news-tok/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const query = sp.get('q')
  if (!query) {
    return NextResponse.json({ error: 'missing ?q' }, { status: 400 })
  }
  const orientation = sp.get('orientation') as 'landscape' | 'portrait' | 'square' | null
  const provider = (sp.get('provider') ?? 'pexels') as 'pexels' | 'pixabay' | 'unsplash'

  try {
    if (provider === 'pixabay') {
      const pxOrientation =
        orientation === 'landscape'
          ? 'horizontal'
          : orientation === 'portrait'
            ? 'vertical'
            : 'all'
      const asset = await pixabay.searchImage({ query, orientation: pxOrientation })
      return NextResponse.json({ asset })
    }
    if (provider === 'unsplash') {
      const asset = await unsplash.searchImage({
        query,
        orientation: orientation ?? undefined,
      })
      return NextResponse.json({ asset })
    }
    const asset = await pexels.searchImage({
      query,
      orientation: orientation ?? undefined,
    })
    return NextResponse.json({ asset })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message, provider }, { status: 500 })
  }
}
