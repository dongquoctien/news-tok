import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ProjectSchema, type Project } from '@news-tok/shared/schema'
import { normalizeAssetPaths } from '@news-tok/shared/sanitize'
import { dataDir, projectStoryboardPath } from './paths.js'

/**
 * Load a project storyboard, validate against schema, and lazily
 * migrate legacy absolute asset paths to the relative-to-`data/`
 * form. The path conversion is **in-memory only**: it lets the renderer
 * + Studio surface old projects without throwing on absolute paths,
 * but does NOT write the migrated shape back to disk until the user
 * saves through Studio PATCH / MCP updateStoryboard (both of which
 * run the same sanitiser). Use `scripts/migrate-paths.ts` to bulk-
 * rewrite every project at once.
 */
export async function readStoryboard(projectId: string): Promise<Project> {
  const path = projectStoryboardPath(projectId)
  const raw = await readFile(path, 'utf8')
  const parsed = ProjectSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(
      `Invalid storyboard at ${path}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    )
  }
  const { project } = normalizeAssetPaths(parsed.data, dataDir())
  return project
}

export async function writeStoryboard(projectId: string, project: Project): Promise<void> {
  const path = projectStoryboardPath(projectId)
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  await writeFile(tmp, JSON.stringify(project, null, 2), 'utf8')
  await rename(tmp, path)
}
