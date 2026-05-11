import { NextResponse, type NextRequest } from 'next/server'
import { listVoices } from '@news-tok/media'
import { LanguageSchema } from '@news-tok/shared/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Local copy of msedge-tts' Voice shape so the inferred GET return type
// doesn't reference msedge-tts via a pnpm-nested path (TS2742).
type VoiceJson = {
  Name: string
  ShortName: string
  Gender: string
  Locale: string
  SuggestedCodec: string
  FriendlyName: string
  Status: string
}

export async function GET(
  req: NextRequest
): Promise<NextResponse<{ voices: VoiceJson[]; count: number } | { error: string }>> {
  try {
    const langParam = req.nextUrl.searchParams.get('lang')
    const language = langParam ? LanguageSchema.parse(langParam) : undefined
    const voices = (await listVoices(language)) as VoiceJson[]
    return NextResponse.json({ voices, count: voices.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
