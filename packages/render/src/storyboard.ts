import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ProjectSchema, type Project } from '@news-tok/shared/schema'
import { projectStoryboardPath } from './paths.js'

export async function readStoryboard(projectId: string): Promise<Project> {
  const path = projectStoryboardPath(projectId)
  const raw = await readFile(path, 'utf8')
  const parsed = ProjectSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(
      `Invalid storyboard at ${path}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    )
  }
  return parsed.data
}

export async function writeStoryboard(projectId: string, project: Project): Promise<void> {
  const path = projectStoryboardPath(projectId)
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  await writeFile(tmp, JSON.stringify(project, null, 2), 'utf8')
  await rename(tmp, path)
}
