import { NextResponse, type NextRequest } from 'next/server'
import { readStoryboard, writeStoryboard } from '@news-tok/render'
import { TextStyleSchema, type TextStyle, type Segment, type Variant } from '@news-tok/shared/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/projects/[id]/text-styles
 *
 * Add (or replace) one user-authored text style on the project. The
 * request body is the full TextStyle JSON; the route validates it
 * against the zod schema and forces `source: 'user'` so a client can't
 * forge a built-in entry by handing in an id that collides with the
 * built-in pool.
 *
 * If `style.id` already exists in `project.userTextStyles`, the entry
 * is replaced in place (so an "Update" action from the builder is a
 * single round-trip). Otherwise the entry is appended.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id
  let project
  try {
    project = await readStoryboard(projectId)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  let body
  try {
    body = (await req.json()) as { style?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  // Validate the style shape before we touch the storyboard. The schema
  // already has zod defaults for optional fields, so missing knobs become
  // their sensible fallbacks instead of crashing the render.
  let parsed: TextStyle
  try {
    parsed = TextStyleSchema.parse({ ...((body.style as Record<string, unknown>) ?? {}), source: 'user' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    )
  }

  const existing = project.userTextStyles ?? []
  const idx = existing.findIndex((s) => s.id === parsed.id)
  const nextUserStyles =
    idx >= 0
      ? existing.map((s, i) => (i === idx ? parsed : s))
      : [...existing, parsed]

  const next = {
    ...project,
    userTextStyles: nextUserStyles,
    updatedAt: new Date().toISOString(),
  }

  try {
    await writeStoryboard(projectId, next)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    )
  }
  return NextResponse.json({ style: parsed, replaced: idx >= 0 })
}

/**
 * DELETE /api/projects/[id]/text-styles?id=<styleId>
 *
 * Remove one user style. Refuses to delete a style that is still
 * referenced by any segment / variant — the caller gets back the list
 * of references so the builder can show a confirm dialog ("the X
 * segments below will fall back to the default style").
 *
 * Pass `force=1` to delete anyway. Affected segments and variants are
 * cleaned: any reference to the dead id is removed so the renderer
 * falls through to the variant default → classic, the same path it
 * uses when a segment has no textStyleId at all.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id
  const styleId = req.nextUrl.searchParams.get('id')
  if (!styleId) {
    return NextResponse.json({ error: 'missing ?id' }, { status: 400 })
  }
  const force = req.nextUrl.searchParams.get('force') === '1'

  let project
  try {
    project = await readStoryboard(projectId)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  const existing = project.userTextStyles ?? []
  const entry = existing.find((s) => s.id === styleId)
  if (!entry) {
    return NextResponse.json({ error: 'style not found' }, { status: 404 })
  }
  if (entry.source === 'builtin') {
    return NextResponse.json({ error: 'cannot delete a built-in style' }, { status: 400 })
  }

  // Scan for references so we can either refuse the delete or clean
  // them up under force.
  const segmentRefs: string[] = []
  for (const seg of project.segments) {
    if (seg.textStyleId === styleId) segmentRefs.push(seg.id)
  }
  const variantRefs: Array<{ variantId: string; sceneKind?: string; segmentId?: string }> = []
  for (const v of project.variants ?? []) {
    for (const [kind, id] of Object.entries(v.textStyleBySceneKind ?? {})) {
      if (id === styleId) variantRefs.push({ variantId: v.id, sceneKind: kind })
    }
    for (const [segId, id] of Object.entries(v.textStyleBySegmentId ?? {})) {
      if (id === styleId) variantRefs.push({ variantId: v.id, segmentId: segId })
    }
  }

  if ((segmentRefs.length || variantRefs.length) && !force) {
    return NextResponse.json(
      {
        error: 'style is in use',
        segmentRefs,
        variantRefs,
      },
      { status: 409 }
    )
  }

  // Forced delete: scrub every reference so the storyboard is valid
  // afterwards. Segments revert to "no per-segment style" — the variant
  // default (or `classic`) takes over.
  const nextSegments: Segment[] = project.segments.map((seg) =>
    seg.textStyleId === styleId ? { ...seg, textStyleId: undefined } : seg
  )
  const nextVariants: Variant[] = (project.variants ?? []).map((v) => {
    const sceneKind: Record<string, string> = {}
    for (const [k, id] of Object.entries(v.textStyleBySceneKind ?? {})) {
      if (id !== styleId) sceneKind[k] = id
    }
    const segmentMap: Record<string, string> = {}
    for (const [k, id] of Object.entries(v.textStyleBySegmentId ?? {})) {
      if (id !== styleId) segmentMap[k] = id
    }
    return {
      ...v,
      textStyleBySceneKind: sceneKind,
      textStyleBySegmentId: segmentMap,
    }
  })

  const next = {
    ...project,
    segments: nextSegments,
    variants: nextVariants,
    userTextStyles: existing.filter((s) => s.id !== styleId),
    updatedAt: new Date().toISOString(),
  }

  try {
    await writeStoryboard(projectId, next)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    )
  }
  return NextResponse.json({ removed: styleId, segmentRefs, variantRefs })
}
