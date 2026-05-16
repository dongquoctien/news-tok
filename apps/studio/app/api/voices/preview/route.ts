import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { synthesize } from '@news-tok/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  voiceId: z.string().min(1),
  // Used for two paths: a short voice sample (~200 chars) and a full
  // segment re-synthesis. Cap is generous so segment narration fits.
  text: z.string().min(1).max(2000).optional(),
  speed: z.number().min(0.5).max(2).optional(),
})

function defaultSample(voiceId: string): string {
  return voiceId.toLowerCase().startsWith('vi-') ? 'Xin chào, đây là bản nghe thử.' : 'Hello, this is a voice sample.'
}

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json())
    const text = body.text ?? defaultSample(body.voiceId)
    const result = await synthesize({ text, voiceId: body.voiceId, speed: body.speed })
    return NextResponse.json({
      path: result.asset.path,
      durationSec: result.durationSec,
      wordBoundaries: result.wordBoundaries,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
