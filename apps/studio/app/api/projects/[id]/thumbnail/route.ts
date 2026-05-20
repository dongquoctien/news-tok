import { NextResponse, type NextRequest } from 'next/server'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ProjectSchema,
  ThumbnailSchema,
  type Thumbnail,
} from '@news-tok/shared/schema'
import {
  projectDir,
  projectOutput,
  readStoryboard,
  writeStoryboard,
  renderThumbnailStill,
} from '@news-tok/render'
import {
  buildThumbnailConfig,
  extractFrames,
  PLATFORM_SAFE_ZONES,
  UNIVERSAL_SAFE_ZONE,
} from '@news-tok/thumbnail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Studio's thumbnail editor endpoint. Mirrors the MCP tools for
 * generate / regenerate but lets the editor save partial edits without
 * re-extracting frames every PATCH.
 *
 *   GET    → returns project.thumbnail + safe-zone metadata for overlay
 *   POST   → runs the full generate flow (extract frames + render still)
 *   PATCH  → save edits, re-render still (no frame re-extract)
 *   DELETE → drop project.thumbnail (revert to "no thumbnail")
 */

function classifyTopicFromProject(project: {
  title: string
  segments: { text: string }[]
  language: 'vi' | 'en'
}): string {
  const text = (project.title + ' ' + project.segments.map((s) => s.text).join(' ')).toLowerCase()
  // Match the heuristic in research.ts at a shallow level so Studio +
  // MCP stay consistent. We only need the topic id to look up the
  // recipe; full topic-router runs inside @news-tok/thumbnail.
  if (/(án|tội phạm|police|murder|crime|killed)/.test(text)) return 'crime'
  if (/(bóng đá|sport|football|world cup|champion)/.test(text)) return 'sports'
  if (/(ai|tech|software|chatgpt|iphone)/.test(text)) return 'tech'
  if (/(sức khỏe|health|covid|vaccine)/.test(text)) return 'health'
  if (/(phim|ca sĩ|showbiz|movie|celebrity)/.test(text)) return 'entertainment'
  if (/(chính phủ|tổng thống|president|election)/.test(text)) return 'politics'
  if (/(giáo dục|education|student|university)/.test(text)) return 'education'
  if (/(bitcoin|stock|finance|crypto|wall street)/.test(text)) return 'finance'
  if (/(môi trường|nature|climate|wildlife)/.test(text)) return 'nature'
  if (/(du lịch|travel|destination|vacation)/.test(text)) return 'travel'
  if (/(món ăn|food|restaurant|recipe)/.test(text)) return 'food'
  if (/(xu hướng|lifestyle|fashion|trend)/.test(text)) return 'lifestyle'
  return 'generic'
}

function safeZonesPayload() {
  return {
    universal: UNIVERSAL_SAFE_ZONE,
    platforms: Object.values(PLATFORM_SAFE_ZONES).map((p) => ({
      platform: p.platform,
      unsafe: p.unsafe,
      gridCrop: p.gridCrop,
    })),
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const project = await readStoryboard(params.id)
    const topic = classifyTopicFromProject(project)
    return NextResponse.json({
      thumbnail: project.thumbnail ?? null,
      topic,
      safeZones: safeZonesPayload(),
      hasRenderedVideo: existsSync(projectOutput(params.id)),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.toLowerCase().includes('enoent') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json().catch(() => ({}))) as { layout?: string; frameCount?: number }
    const project = await readStoryboard(params.id)
    const videoPath = projectOutput(params.id)
    if (!existsSync(videoPath)) {
      return NextResponse.json(
        {
          error:
            'No rendered video at output.mp4. Render the project first; the thumbnail extracts frames from the final video.',
        },
        { status: 400 }
      )
    }
    const topic = classifyTopicFromProject(project)
    const candidatesDir = resolve(projectDir(params.id), 'thumb-candidates')
    const { thumbnail, warnings } = await buildThumbnailConfig({
      project: {
        title: project.title,
        language: project.language,
        segments: project.segments,
      },
      videoPath,
      outDir: candidatesDir,
      topic,
      layoutOverride: body.layout as Thumbnail['layout'] | undefined,
      frameCount: body.frameCount,
    })

    const path = await renderThumbnailStill({
      projectId: params.id,
      thumbnail,
      topic,
    })

    const updated = ProjectSchema.parse({
      ...project,
      thumbnail: { ...thumbnail, path },
      updatedAt: new Date().toISOString(),
    })
    await writeStoryboard(params.id, updated)

    return NextResponse.json({
      thumbnail: updated.thumbnail,
      path,
      warnings,
      topic,
      safeZones: safeZonesPayload(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const parsed = ThumbnailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid thumbnail',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      )
    }
    const project = await readStoryboard(params.id)
    const topic = classifyTopicFromProject(project)

    const path = await renderThumbnailStill({
      projectId: params.id,
      thumbnail: parsed.data,
      topic,
    })

    const updated = ProjectSchema.parse({
      ...project,
      thumbnail: { ...parsed.data, path },
      updatedAt: new Date().toISOString(),
    })
    await writeStoryboard(params.id, updated)

    return NextResponse.json({ thumbnail: updated.thumbnail, path })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const project = await readStoryboard(params.id)
    const updated = ProjectSchema.parse({
      ...project,
      thumbnail: undefined,
      updatedAt: new Date().toISOString(),
    })
    await writeStoryboard(params.id, updated)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
