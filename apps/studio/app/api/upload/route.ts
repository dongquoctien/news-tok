import { NextResponse, type NextRequest } from 'next/server'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { cacheKey, cachePath, writeAtomic } from '@news-tok/media'
import type { AssetRef } from '@news-tok/shared/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hard cap to keep accidental drag of a giant file from filling the disk.
// 50 MB covers any reasonable bg-music or hi-res image.
const MAX_BYTES = 50 * 1024 * 1024

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
}

function kindFromMime(mime: string): 'image' | 'audio' | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  return null
}

function extFromName(name: string): string | null {
  const m = name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1]!.toLowerCase() : null
}

export async function POST(req: NextRequest) {
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

  const fileName = 'name' in file && typeof file.name === 'string' ? file.name : 'upload.bin'
  const kind = kindFromMime(file.type)
  if (!kind) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || 'unknown'}. Use image/* or audio/*.` },
      { status: 415 }
    )
  }

  const ext = EXT_BY_MIME[file.type] ?? extFromName(fileName) ?? (kind === 'image' ? 'jpg' : 'mp3')
  const buffer = Buffer.from(await file.arrayBuffer())
  // Hash content so re-uploading the same file dedupes.
  const key = cacheKey(['upload', kind, buffer])
  const outPath = cachePath('uploads', key, ext)

  if (!existsSync(outPath)) {
    await writeAtomic(outPath, buffer)
  }
  const st = await stat(outPath)

  const asset: AssetRef = {
    kind: kind === 'image' ? 'image' : 'audio',
    path: outPath,
    source: {
      provider: 'local',
      id: fileName,
      attribution: fileName,
    },
  }
  // Audio duration would need ffprobe; the editor lets users adjust it
  // anyway, so leave durationSec undefined for audio uploads. For images
  // the renderer doesn't read durationSec.
  return NextResponse.json({ asset, size: st.size })
}
