import { NextResponse } from 'next/server'
import { BUILT_IN_TEXT_STYLES } from '@news-tok/shared/text-styles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/text-styles — list every built-in text style.
 *
 * The shape we return is exactly the TextStyle JSON the renderer
 * consumes, so the Studio picker can preview a card and write the
 * selected id back to the storyboard without an extra lookup.
 */
export async function GET() {
  return NextResponse.json({
    builtIn: BUILT_IN_TEXT_STYLES,
    count: BUILT_IN_TEXT_STYLES.length,
  })
}
