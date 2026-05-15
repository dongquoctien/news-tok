import { NextResponse, type NextRequest } from 'next/server'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { ProjectSchema, type Project } from '@news-tok/shared/schema'
import {
  fitSegmentDurations,
  normalizeAssetPaths,
  normalizeSceneNames,
  reconcileLibrary,
  stripEmoji,
} from '@news-tok/shared/sanitize'
import {
  dataDir,
  deleteProject,
  projectScenesDir,
  readStoryboard,
  writeStoryboard,
} from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Built-in scene kinds the renderer registers in
 * `packages/remotion/src/scenes/registry.ts`. Anything else must either
 * be a custom scene file under `data/projects/<id>/scenes/` (loaded by
 * `packages/render/src/bundle.ts`) or a typo we should reject early.
 *
 * Catching the typo here (PATCH /api/projects/[id]) means Studio users
 * see a clear "Unknown scene: X" message at Save time instead of a
 * cryptic Remotion `Unknown scene` thrown deep inside a render job
 * 30 seconds later. The Zod schema can't enforce this itself because
 * the scene field allows arbitrary strings to support custom scenes.
 */
const BUILT_IN_SCENE_KINDS = new Set(['title', 'keypoint', 'quote', 'outro'])

async function listProjectCustomSceneNames(projectId: string): Promise<Set<string>> {
  const dir = projectScenesDir(projectId)
  if (!existsSync(dir)) return new Set()
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return new Set(
      entries
        .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
        .map((e) => e.name.replace(/\.tsx?$/, ''))
    )
  } catch {
    return new Set()
  }
}

/**
 * Validate that every segment's `scene` resolves to either a built-in
 * kind or a custom scene file. Returns the list of offending segments;
 * empty array = all good.
 */
async function validateSceneNames(
  projectId: string,
  project: Project
): Promise<{ segmentId: string; scene: string; suggestion?: string }[]> {
  const custom = await listProjectCustomSceneNames(projectId)
  const bad: { segmentId: string; scene: string; suggestion?: string }[] = []
  for (const seg of project.segments) {
    const name = String(seg.scene)
    if (BUILT_IN_SCENE_KINDS.has(name)) continue
    if (custom.has(name)) continue
    // Common bug: PascalCase component name instead of the lowercase
    // scene kind. Suggest the obvious correction so the user can fix
    // it with one click rather than guess.
    const lower = name.toLowerCase()
    const suggestion =
      lower === 'titlecard' ? 'title' :
      lower === 'keypoint' ? 'keypoint' :
      lower === 'outro' ? 'outro' :
      lower === 'quote' ? 'quote' :
      undefined
    bad.push({ segmentId: seg.id, scene: name, suggestion })
  }
  return bad
}

function sanitize(project: Project): Project {
  return {
    ...project,
    title: stripEmoji(project.title),
    segments: project.segments.map((s) => ({
      ...s,
      text: stripEmoji(s.text),
    })),
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const project = await readStoryboard(params.id)
    return NextResponse.json(project)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.toLowerCase().includes('enoent') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteProject(params.id)
    return NextResponse.json({ deleted: params.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const parsed = ProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid storyboard',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      )
    }
    if (parsed.data.id !== params.id) {
      return NextResponse.json(
        { error: `Project id mismatch: ${parsed.data.id} vs ${params.id}` },
        { status: 400 }
      )
    }
    // Auto-fix common PascalCase scene typos (TitleCard → title, etc.)
    // BEFORE the hard guard fires, so the orchestrator's mistakes get
    // silently corrected instead of bouncing back as errors. The guard
    // below still catches names the sanitiser doesn't know how to map.
    const { project: scenesNormalized } = normalizeSceneNames(parsed.data)
    const badScenes = await validateSceneNames(params.id, scenesNormalized)
    if (badScenes.length > 0) {
      const message =
        `Unknown scene name${badScenes.length > 1 ? 's' : ''}: ` +
        badScenes
          .map((b) =>
            b.suggestion
              ? `"${b.scene}" (segment ${b.segmentId}; did you mean "${b.suggestion}"?)`
              : `"${b.scene}" (segment ${b.segmentId})`
          )
          .join(', ')
      return NextResponse.json(
        { error: message, badScenes },
        { status: 400 }
      )
    }
    const cleaned = sanitize({ ...scenesNormalized, updatedAt: new Date().toISOString() })
    // Defence in depth: even if the client forgets to stretch a segment to
    // fit narration, normalise here so the storyboard durations always
    // match what the renderer will play.
    const { project: fitted } = fitSegmentDurations(cleaned)
    // Reconcile library: dedupe existing entries + mirror segment
    // backgrounds. Library tab in Studio = "all media this project
    // uses" (stock + article + manual upload). Back-fills old projects
    // the first time the user saves them.
    const { project: withLibrary } = reconcileLibrary(fitted)
    // Final step: rewrite any absolute AssetRef paths to the new
    // relative-to-data/ form so storyboards stay portable across
    // machines. Runs LAST so paths added by reconcileLibrary's
    // segment mirroring also get normalised.
    const { project: next } = normalizeAssetPaths(withLibrary, dataDir())
    await writeStoryboard(params.id, next)
    return NextResponse.json(next)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
