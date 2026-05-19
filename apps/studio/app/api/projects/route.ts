import { mkdir } from 'node:fs/promises'
import { NextResponse, type NextRequest } from 'next/server'
import {
  ASPECT_PRESETS,
  AspectSchema,
  LanguageSchema,
  ProjectSchema,
  type Project,
} from '@news-tok/shared/schema'
import {
  listProjects,
  projectDir,
  projectScenesDir,
  writeStoryboard,
} from '@news-tok/render'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const projects = await listProjects()
    return NextResponse.json({ projects, count: projects.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Body schema for the manual "New project" flow on /projects. Mirrors the
// MCP `createProject` tool but skips the article-source step — the orchestrator
// path on the home page still handles URL / text extraction; this endpoint
// exists so the user can scaffold an empty storyboard directly from Studio.
const CreateBodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  language: LanguageSchema,
  aspect: AspectSchema,
})

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
}

function uniqueId(seed: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 7)
  const slug = slugify(seed) || 'untitled'
  return `${stamp}-${slug}-${rand}`
}

function defaultTitle(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `Untitled ${yyyy}-${mm}-${dd}`
}

/**
 * Create a manual (empty) project. Matches the shape produced by the MCP
 * `createProject` tool so storyboards from either path are byte-compatible:
 *
 *   - segments: []           — user fills via the Studio sidebar
 *   - source.type: 'text'    — schema requires a source; "(manual)" is the
 *                              sentinel value Studio uses for empty seeds
 *   - sfxEnabled: false      — matches the AI path default
 *   - logo: @newstokvn text  — matches the AI path default watermark
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = CreateBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid create-project body',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      )
    }
    const { title, language, aspect } = parsed.data
    if (!(aspect in ASPECT_PRESETS)) {
      return NextResponse.json({ error: `Invalid aspect: ${aspect}` }, { status: 400 })
    }

    const resolvedTitle = title?.trim() || defaultTitle()
    const projectId = uniqueId(resolvedTitle)
    const dir = projectDir(projectId)
    await mkdir(dir, { recursive: true })
    await mkdir(projectScenesDir(projectId), { recursive: true })

    const now = new Date().toISOString()
    const project: Project = ProjectSchema.parse({
      id: projectId,
      title: resolvedTitle,
      source: { type: 'text', value: '(manual)' },
      language,
      aspect,
      segments: [],
      bgMusicVolume: 0.2,
      sfxEnabled: false,
      logo: {
        kind: 'text',
        text: '@newstokvn',
        fontId: 'inter',
        sizePct: 2.2,
        color: '#ffffff',
        background: {
          color: 'rgba(0,0,0,0.45)',
          paddingPx: 10,
          radiusPx: 6,
        },
        position: 'bottom-right',
        marginPct: 3,
        opacity: 0.85,
        appliesTo: 'all',
      },
      createdAt: now,
      updatedAt: now,
    })
    await writeStoryboard(projectId, project)

    return NextResponse.json({ projectId, path: dir }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
