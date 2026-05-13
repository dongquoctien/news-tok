import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  ProjectSchema,
  type Aspect,
  type Language,
  type Project,
} from '@news-tok/shared/schema'
import { projectDir, projectStoryboardPath, projectsDir } from './paths.js'
import { readStoryboard, writeStoryboard } from './storyboard.js'

export type ProjectSummary = {
  projectId: string
  title: string
  language: Language
  aspect: Aspect
  segmentCount: number
  hasOutput: boolean
  /**
   * Variant ids that have an `output-<id>.mp4` on disk. Empty when the
   * project has only the legacy single `output.mp4` (or no render yet).
   */
  outputVariantIds: string[]
  /** Variant ids declared on the storyboard, regardless of render state. */
  declaredVariantIds: string[]
  /**
   * Pre-lowercased haystack of the project's textual content
   * (title + every segment.text). Lets the Studio projects grid
   * substring-search across narration copy without shipping the
   * full storyboard to the client.
   */
  searchHaystack: string
  createdAt: string
  updatedAt: string
}

async function scanOutputs(projectId: string): Promise<string[]> {
  const dir = projectDir(projectId)
  if (!existsSync(dir)) return []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const ids: string[] = []
    for (const e of entries) {
      if (!e.isFile()) continue
      const match = /^output-([A-Za-z0-9_-]+)\.mp4$/.exec(e.name)
      if (match) ids.push(match[1]!)
    }
    ids.sort()
    return ids
  } catch {
    return []
  }
}

async function summarize(project: Project): Promise<ProjectSummary> {
  const outputVariantIds = await scanOutputs(project.id)
  const declaredVariantIds = (project.variants ?? []).map((v) => v.id)
  const legacyOutput = existsSync(resolve(projectDir(project.id), 'output.mp4'))
  const haystackParts = [project.title, ...project.segments.map((s) => s.text)]
  return {
    projectId: project.id,
    title: project.title,
    language: project.language,
    aspect: project.aspect,
    segmentCount: project.segments.length,
    hasOutput: legacyOutput || outputVariantIds.length > 0,
    outputVariantIds,
    declaredVariantIds,
    searchHaystack: haystackParts.join(' \n ').toLowerCase(),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const root = projectsDir()
  if (!existsSync(root)) return []
  const entries = await readdir(root, { withFileTypes: true })
  const out: ProjectSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const sbPath = projectStoryboardPath(entry.name)
    if (!existsSync(sbPath)) continue
    try {
      const raw = await readFile(sbPath, 'utf8')
      const parsed = ProjectSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) continue
      out.push(await summarize(parsed.data))
    } catch {
      // Skip unreadable project folders rather than failing the whole list.
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return out
}

export async function getProjectSummary(projectId: string): Promise<ProjectSummary> {
  const project = await readStoryboard(projectId)
  return summarize(project)
}

function uniqueIdFromTitle(title: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 7)
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
  return `${stamp}-${slug || 'project'}-${rand}`
}

export async function duplicateProject(sourceId: string): Promise<{ projectId: string; path: string }> {
  const src = await readStoryboard(sourceId)
  const newId = uniqueIdFromTitle(`${src.title} copy`)
  const newDir = projectDir(newId)
  await mkdir(newDir, { recursive: true })

  // Copy the project tree except output.mp4 / segments (those are render
  // artifacts that should be re-generated for the new project).
  const srcDir = projectDir(sourceId)
  const entries = await readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'output.mp4' || entry.name === 'segments' || entry.name === '.job.json') {
      continue
    }
    await cp(resolve(srcDir, entry.name), resolve(newDir, entry.name), { recursive: true })
  }

  const now = new Date().toISOString()
  // Rewrite per-project custom SFX paths so they point at the duplicate's
  // sfx/ directory (already copied above) instead of the source project.
  // Without this, deleting the source project would invalidate every
  // override on the duplicate.
  const customSfx = (src.customSfx ?? []).map((entry) => ({
    ...entry,
    path: entry.path.replace(srcDir, newDir),
  }))
  const copy: Project = {
    ...src,
    id: newId,
    title: `${src.title} (copy)`,
    customSfx,
    createdAt: now,
    updatedAt: now,
  }
  ProjectSchema.parse(copy)
  await writeStoryboard(newId, copy)
  return { projectId: newId, path: newDir }
}

export async function deleteProject(projectId: string): Promise<void> {
  const dir = projectDir(projectId)
  if (!existsSync(dir)) {
    throw new Error(`Project ${projectId} does not exist`)
  }
  await rm(dir, { recursive: true, force: true })
}
