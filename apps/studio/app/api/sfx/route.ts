import { NextResponse } from 'next/server'
import { BUILT_IN_SFX } from '@news-tok/shared/sfx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/sfx — list every entry in the built-in SFX bank.
 *
 * Returns id + label + duration + source so the Studio dropdown can
 * preview the metadata without bundling the registry into the page
 * chunk. The actual mp3 file may or may not be present on disk
 * (`packages/shared/sfx/<id>.mp3`); when it's missing the renderer
 * treats it as silence.
 */
export async function GET() {
  return NextResponse.json({
    builtIn: BUILT_IN_SFX,
    count: BUILT_IN_SFX.length,
  })
}
