import { NextResponse, type NextRequest } from 'next/server'
import { archive, pixabay } from '@news-tok/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mood = sp.get('mood')
  const durationParam = sp.get('duration')
  if (!mood || !durationParam) {
    return NextResponse.json({ error: 'mood and duration are required' }, { status: 400 })
  }
  const durationSec = Number.parseFloat(durationParam)
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return NextResponse.json({ error: 'duration must be a positive number' }, { status: 400 })
  }
  const provider = (sp.get('provider') ?? 'archive') as 'archive' | 'pixabay'
  try {
    if (provider === 'pixabay') {
      const asset = await pixabay.searchMusic({ mood, durationSec })
      return NextResponse.json({ asset })
    }
    const asset = await archive.searchMusic({ mood, durationSec })
    return NextResponse.json({ asset })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message, provider }, { status: 500 })
  }
}
