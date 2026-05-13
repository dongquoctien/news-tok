import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { probeDurationSec } from '@news-tok/media'
import {
  projectSfxDir,
  readStoryboard,
  writeStoryboard,
} from '@news-tok/render'
import {
  type CustomSfxEntry,
} from '@news-tok/shared/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 500 * 1024
const MAX_DURATION_SEC = 5

function slugFromName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'sfx'
}

/** POST /api/projects/[id]/sfx — multipart upload of one mp3. */
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
  if (!file.type.startsWith('audio/')) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || 'unknown'}. Use audio/mpeg (.mp3).` },
      { status: 415 }
    )
  }

  const fileName = 'name' in file && typeof file.name === 'string' ? file.name : 'sfx.mp3'
  const label = (form.get('label') as string | null)?.trim() || slugFromName(fileName)
  const buffer = Buffer.from(await file.arrayBuffer())

  // Content-hash slug so the same upload twice dedupes to one entry.
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 8)
  const slug = `user-${slugFromName(fileName)}-${hash}`

  // Already in this project's bank? Return existing entry.
  const existing = (project.customSfx ?? []).find((e) => e.id === slug)
  if (existing) {
    return NextResponse.json({ entry: existing, dedup: true })
  }

  const sfxDir = projectSfxDir(projectId)
  await mkdir(sfxDir, { recursive: true })
  const filePath = resolve(sfxDir, `${slug}.mp3`)
  await writeFile(filePath, buffer)

  let durationSec: number
  try {
    durationSec = await probeDurationSec(filePath)
  } catch (err) {
    await rm(filePath, { force: true })
    return NextResponse.json(
      { error: 'Could not read mp3 duration: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 400 }
    )
  }

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    await rm(filePath, { force: true })
    return NextResponse.json({ error: 'Invalid mp3: no playable audio detected' }, { status: 400 })
  }
  if (durationSec > MAX_DURATION_SEC) {
    await rm(filePath, { force: true })
    return NextResponse.json(
      {
        error: `SFX too long (${durationSec.toFixed(1)}s; max ${MAX_DURATION_SEC}s). Use background music for longer clips.`,
      },
      { status: 413 }
    )
  }

  const entry: CustomSfxEntry = {
    id: slug,
    label,
    durationSec: Math.round(durationSec * 1000) / 1000,
    path: filePath,
    defaultGain: 1,
    originalName: fileName,
    uploadedAt: new Date().toISOString(),
  }

  const next = {
    ...project,
    customSfx: [...(project.customSfx ?? []), entry],
    updatedAt: new Date().toISOString(),
  }
  await writeStoryboard(projectId, next)
  return NextResponse.json({ entry, dedup: false })
}

/** DELETE /api/projects/[id]/sfx?slug=... — remove one custom SFX entry. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) {
    return NextResponse.json({ error: 'missing ?slug' }, { status: 400 })
  }

  let project
  try {
    project = await readStoryboard(projectId)
  } catch {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  const customSfx = project.customSfx ?? []
  const entry = customSfx.find((e) => e.id === slug)
  if (!entry) {
    return NextResponse.json({ error: 'sfx not found in this project' }, { status: 404 })
  }

  if (existsSync(entry.path)) {
    await rm(entry.path, { force: true })
  }

  const next = {
    ...project,
    customSfx: customSfx.filter((e) => e.id !== slug),
    updatedAt: new Date().toISOString(),
  }
  await writeStoryboard(projectId, next)
  return NextResponse.json({ removed: slug })
}
