import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ProjectSchema, type AssetRef, type Project } from '@news-tok/shared/schema'
import { dataDir, projectLibraryDir, readStoryboard, writeStoryboard } from '@news-tok/render'
import {
  fitSegmentDurations,
  normalizeAssetPaths,
  stripEmoji,
} from '@news-tok/shared/sanitize'
import { resolveDataPath, toRelativeDataPath } from '@news-tok/shared/paths'
import { probeVideoMetadata } from '@news-tok/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Per-file caps — images stay at 50 MB (no reason to grow with the new
// video support), videos are allowed up to 200 MB so a 30s 1080p H.264
// clip from a news source fits comfortably.
const MAX_IMAGE_BYTES = 50 * 1024 * 1024
const MAX_VIDEO_BYTES = 200 * 1024 * 1024
// Total batch cap — drag-folder can balloon fast; 80 files / 800 MB is
// plenty for a typical short-form project (mixed images + a couple
// videos) and keeps memory bounded.
const MAX_FILES = 80
const MAX_TOTAL_BYTES = 800 * 1024 * 1024

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

function isAcceptedMime(mime: string): boolean {
  return mime.startsWith('image/') || mime.startsWith('video/')
}

function perFileCap(mime: string): number {
  return mime.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
}

function extFromName(name: string): string | null {
  const m = name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1]!.toLowerCase() : null
}

function sanitizeProject(project: Project): Project {
  return {
    ...project,
    title: stripEmoji(project.title),
    segments: project.segments.map((s) => ({ ...s, text: stripEmoji(s.text) })),
  }
}

/**
 * Append one or more images or video clips to the project's library.
 * Files are hashed by content so re-dropping the same folder is a no-op
 * rather than duplicating disk usage.
 *
 * Body: multipart/form-data with one or more `file` fields. Accepts
 * `image/*` and `video/*`; non-media MIME types are rejected so a
 * misclick on a music folder doesn't end up here. Videos additionally
 * get probed by ffmpeg so the AssetRef carries `durationSec` + frame
 * dimensions — the renderer needs `durationSec` to compute the loop
 * window when the clip is shorter than the segment.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]+$/.test(params.id)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
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

  const files: Blob[] = []
  for (const v of form.getAll('file')) {
    if (v instanceof Blob) files.push(v)
  }
  if (files.length === 0) {
    return NextResponse.json({ error: 'No "file" fields in form' }, { status: 400 })
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (${files.length}; max ${MAX_FILES}). Upload in batches.` },
      { status: 413 }
    )
  }
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      {
        error: `Total upload too large (${totalBytes} bytes; max ${MAX_TOTAL_BYTES}).`,
      },
      { status: 413 }
    )
  }

  // Read the live storyboard so we can append + dedupe against entries
  // that already exist in `project.library`.
  let project: Project
  try {
    project = await readStoryboard(params.id)
  } catch (err) {
    return NextResponse.json(
      { error: `Cannot read project: ${err instanceof Error ? err.message : String(err)}` },
      { status: 404 }
    )
  }

  const libDir = projectLibraryDir(params.id)
  await mkdir(libDir, { recursive: true })

  // Build the dedupe set using canonical relative form so existing
  // entries stored as either absolute (legacy) or relative match
  // against the new upload's relative path consistently.
  const existingPaths = new Set(
    (project.library ?? []).map((a) => toRelativeDataPath(a.path))
  )
  const added: AssetRef[] = []
  const skipped: { name: string; reason: string }[] = []

  for (const blob of files) {
    const fileName =
      'name' in blob && typeof blob.name === 'string' ? blob.name : 'upload.bin'

    if (blob.size === 0) {
      skipped.push({ name: fileName, reason: 'empty' })
      continue
    }
    if (!isAcceptedMime(blob.type)) {
      skipped.push({ name: fileName, reason: `unsupported type "${blob.type}"` })
      continue
    }
    const cap = perFileCap(blob.type)
    if (blob.size > cap) {
      skipped.push({ name: fileName, reason: `>${cap} bytes` })
      continue
    }

    const isVideo = blob.type.startsWith('video/')
    const ext =
      EXT_BY_MIME[blob.type] ?? extFromName(fileName) ?? (isVideo ? 'mp4' : 'jpg')
    const buffer = Buffer.from(await blob.arrayBuffer())
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24)
    const outPath = resolve(libDir, `${hash}.${ext}`)

    if (!existsSync(outPath)) {
      const tmp = `${outPath}.${process.pid}.tmp`
      await writeFile(tmp, buffer)
      await rename(tmp, outPath)
    }

    // Store + dedupe by relative form. The normaliser in the sanitiser
    // chain would rewrite this anyway, but emitting relative directly
    // keeps the storyboard response we return to the client clean.
    const relPath = toRelativeDataPath(outPath)
    if (existingPaths.has(relPath)) {
      skipped.push({ name: fileName, reason: 'already in library' })
      continue
    }
    existingPaths.add(relPath)

    // For video we run ffmpeg probe so the AssetRef carries duration +
    // dimensions. The renderer reads `durationSec` to wrap the clip in
    // <Loop> when it's shorter than the segment; width/height let
    // Studio pick a thumbnail layout that won't letterbox. If probe
    // fails (unsupported codec, corrupt file), we still accept the
    // upload but mark it kind:'video' without metadata — the renderer
    // falls back to no-loop behaviour.
    let metadata: { durationSec?: number; width?: number; height?: number } = {}
    if (isVideo) {
      try {
        metadata = await probeVideoMetadata(outPath)
      } catch {
        // best-effort — bare AssetRef is still useful enough to render
      }
    }

    added.push({
      kind: isVideo ? 'video' : 'image',
      path: relPath,
      source: { provider: 'local', id: fileName, attribution: fileName },
      ...(metadata.durationSec !== undefined ? { durationSec: metadata.durationSec } : {}),
      ...(metadata.width !== undefined ? { width: metadata.width } : {}),
      ...(metadata.height !== undefined ? { height: metadata.height } : {}),
    })
  }

  // Persist the merged library back into the storyboard. We re-validate
  // through the schema so a stale on-disk file can't sneak invalid state
  // through this side door.
  const nextProject: Project = {
    ...project,
    library: [...(project.library ?? []), ...added],
    updatedAt: new Date().toISOString(),
  }
  const parsed = ProjectSchema.safeParse(nextProject)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Library update failed validation',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 500 }
    )
  }
  const { project: fitted } = fitSegmentDurations(sanitizeProject(parsed.data))
  // Normalise absolute paths to data/-relative before write so storyboards
  // stay portable (matches Studio PATCH + MCP updateStoryboard chain).
  const { project: stretched } = normalizeAssetPaths(fitted, dataDir())
  await writeStoryboard(params.id, stretched)

  return NextResponse.json({
    added,
    skipped,
    library: stretched.library,
  })
}

/**
 * Remove a single library entry. Path is taken from a JSON body to avoid
 * encoding pain — the absolute path can contain spaces / Vietnamese
 * characters that wouldn't survive a URL segment cleanly.
 *
 * Body: { path: string }
 *
 * The file under `data/projects/<id>/library/` is deleted from disk
 * AFTER the storyboard is rewritten without it; if the rewrite fails
 * the file stays and we surface the error.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]+$/.test(params.id)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }
  let body: { path?: string }
  try {
    body = (await req.json()) as { path?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const target = body.path?.trim()
  if (!target) {
    return NextResponse.json({ error: 'Missing "path"' }, { status: 400 })
  }
  // Confine deletes to this project's library dir. Accept both the new
  // relative-to-data/ form ("projects/p1/library/abc.jpg") and the
  // legacy absolute form so old client bookmarks still work.
  const libDir = projectLibraryDir(params.id)
  const resolved = resolve(resolveDataPath(target))
  if (!resolved.startsWith(libDir)) {
    return NextResponse.json(
      { error: 'Path is not inside this project\'s library directory' },
      { status: 400 }
    )
  }

  let project: Project
  try {
    project = await readStoryboard(params.id)
  } catch (err) {
    return NextResponse.json(
      { error: `Cannot read project: ${err instanceof Error ? err.message : String(err)}` },
      { status: 404 }
    )
  }

  // Library entries on disk now use the relative form, but legacy
  // storyboards still have absolute paths. Match both shapes by
  // comparing the canonical relative form.
  const targetRel = toRelativeDataPath(resolved)
  const before = project.library ?? []
  const after = before.filter((a) => toRelativeDataPath(a.path) !== targetRel)
  if (after.length === before.length) {
    return NextResponse.json({ error: 'Entry not found in library' }, { status: 404 })
  }

  const nextProject: Project = {
    ...project,
    library: after,
    updatedAt: new Date().toISOString(),
  }
  const parsed = ProjectSchema.safeParse(nextProject)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Library update failed validation' },
      { status: 500 }
    )
  }
  const { project: fitted } = fitSegmentDurations(sanitizeProject(parsed.data))
  // Normalise absolute paths to data/-relative before write so storyboards
  // stay portable (matches Studio PATCH + MCP updateStoryboard chain).
  const { project: stretched } = normalizeAssetPaths(fitted, dataDir())
  await writeStoryboard(params.id, stretched)

  // Best-effort delete of the file. If another segment is still using
  // it (unlikely after we removed it from the library, but a power
  // user may have copied the path manually), we still report success
  // for the storyboard mutation.
  try {
    if (existsSync(resolved)) await unlink(resolved)
  } catch {
    // swallow — the metadata is already gone and the user can clean
    // the orphan file from disk if needed.
  }

  return NextResponse.json({ removed: resolved, library: stretched.library })
}
