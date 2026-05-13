import { NextResponse, type NextRequest } from 'next/server'
import { BUILT_IN_TEXT_STYLES } from '@news-tok/shared/text-styles'
import { readStoryboard } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/text-styles[?projectId=...]
 *
 * Without `projectId`: returns just the built-in text style pool, which
 * is enough for callers that want to browse styles without scoping to
 * a project (e.g. landing page demo).
 *
 * With `projectId`: also returns the project's `userTextStyles[]` so
 * the picker can list both sources in one merged grid.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId') ?? undefined
  let userStyles: typeof BUILT_IN_TEXT_STYLES = []
  if (projectId) {
    try {
      const project = await readStoryboard(projectId)
      userStyles = project.userTextStyles ?? []
    } catch {
      // Unknown project ids are not fatal — just fall back to built-in only.
    }
  }
  return NextResponse.json({
    builtIn: BUILT_IN_TEXT_STYLES,
    user: userStyles,
    count: BUILT_IN_TEXT_STYLES.length + userStyles.length,
  })
}
