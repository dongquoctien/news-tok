import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { projectDir, readStoryboard, writeStoryboard } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 2 * 1024 * 1024

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
}

/**
 * POST /api/projects/[id]/logo — upload a watermark image. The file
 * lands at `data/projects/<id>/logo.<ext>` (one per project, the previous
 * upload is overwritten). The storyboard's `logo` field is updated to
 * `kind: 'image'` while preserving any existing placement (position,
 * marginPct, sizePct, opacity, appliesTo).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id
  let project
  try {
    project = await readStoryboard(projectId)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid multipart body: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 400 }
    )
  }

  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} bytes; max ${MAX_BYTES})` },
      { status: 413 }
    )
  }
  const ext = EXT_BY_MIME[file.type]
  if (!ext) {
    return NextResponse.json(
      {
        error: `Unsupported image type: ${file.type || 'unknown'}. Use png / jpg / webp / svg.`,
      },
      { status: 415 }
    )
  }

  const dir = projectDir(projectId)
  await mkdir(dir, { recursive: true })

  // Clean up any previous logo file with a different extension so we don't
  // leak stale files when the user swaps formats.
  for (const otherExt of Object.values(EXT_BY_MIME)) {
    if (otherExt === ext) continue
    const stale = resolve(dir, `logo.${otherExt}`)
    if (existsSync(stale)) await rm(stale, { force: true })
  }

  const filePath = resolve(dir, `logo.${ext}`)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const fileName = 'name' in file && typeof file.name === 'string' ? file.name : `logo.${ext}`

  // Preserve placement controls from the existing entry when re-uploading.
  const prev = project.logo
  const placement =
    prev && prev.kind !== 'none'
      ? {
          position: prev.position,
          marginPct: prev.marginPct,
          opacity: prev.opacity,
          appliesTo: prev.appliesTo,
        }
      : ({
          position: 'top-right' as const,
          marginPct: 5,
          opacity: 0.85,
          appliesTo: 'all' as const,
        })
  const prevSize =
    prev && prev.kind === 'image' ? prev.sizePct : 13

  const next = {
    ...project,
    logo: {
      kind: 'image' as const,
      path: filePath,
      originalName: fileName,
      sizePct: prevSize,
      ...placement,
    },
    updatedAt: new Date().toISOString(),
  }
  await writeStoryboard(projectId, next)
  return NextResponse.json({ logo: next.logo })
}

/** DELETE /api/projects/[id]/logo — remove the watermark (file + entry). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id
  let project
  try {
    project = await readStoryboard(projectId)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  // Always wipe any logo file on disk regardless of the storyboard state,
  // so a stale file from a previous session can't outlive the entry.
  const dir = projectDir(projectId)
  for (const ext of Object.values(EXT_BY_MIME)) {
    const candidate = resolve(dir, `logo.${ext}`)
    if (existsSync(candidate)) await rm(candidate, { force: true })
  }

  const next = {
    ...project,
    logo: { kind: 'none' as const },
    updatedAt: new Date().toISOString(),
  }
  await writeStoryboard(projectId, next)
  return NextResponse.json({ logo: next.logo })
}

/**
 * PATCH /api/projects/[id]/logo — update logo metadata in place (text
 * watermark, position, size, opacity, appliesTo). Body is the partial
 * LogoMarker object to merge.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id
  let project
  try {
    project = await readStoryboard(projectId)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  let body
  try {
    body = (await req.json()) as { logo: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (!body?.logo || typeof body.logo !== 'object') {
    return NextResponse.json({ error: 'missing logo in body' }, { status: 400 })
  }

  const next = {
    ...project,
    logo: body.logo as typeof project.logo,
    updatedAt: new Date().toISOString(),
  }
  // writeStoryboard validates against the schema; an invalid logo shape
  // will throw a clear zod error which we surface to the caller.
  try {
    await writeStoryboard(projectId, next)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    )
  }
  return NextResponse.json({ logo: next.logo })
}
