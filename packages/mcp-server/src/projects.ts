import { mkdir } from 'node:fs/promises'
import {
  ASPECT_PRESETS,
  DEFAULT_VOICES,
  ProjectSchema,
  type Aspect,
  type Language,
  type Project,
  type Source,
} from '@news-tok/shared/schema'
import {
  listProjects,
  projectDir,
  projectScenesDir,
  projectStoryboardPath,
  writeStoryboard,
  type ProjectSummary,
} from '@news-tok/render'

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

export type CreateProjectInput = {
  source: Source
  language: Language
  aspect: Aspect
  /** Optional human title; defaults to derived from source. */
  title?: string
}

export type CreateProjectResult = {
  projectId: string
  path: string
  storyboardPath: string
}

function deriveTitle(input: CreateProjectInput): string {
  if (input.title) return input.title
  if (input.source.type === 'url') {
    try {
      const u = new URL(input.source.value)
      return u.hostname.replace(/^www\./, '')
    } catch {
      return 'Untitled'
    }
  }
  return input.source.value.slice(0, 60).trim() || 'Untitled'
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  if (!(input.aspect in ASPECT_PRESETS)) {
    throw new Error(`Invalid aspect: ${input.aspect}`)
  }

  const projectId = uniqueId(deriveTitle(input))
  const dir = projectDir(projectId)
  await mkdir(dir, { recursive: true })
  await mkdir(projectScenesDir(projectId), { recursive: true })

  const now = new Date().toISOString()
  // Two project-wide defaults that differ from the schema fallback so
  // every generated video matches the news-tok house style:
  //   - logo: a "@newstokvn" text watermark in the bottom-right of
  //     every segment (the schema default is { kind:'none' } to keep
  //     legacy stored projects unchanged).
  //   - sfxEnabled: false — generated videos should be SFX-free unless
  //     the user explicitly opts in (the schema default is true to
  //     keep legacy stored projects rendering the same as before).
  const project: Project = ProjectSchema.parse({
    id: projectId,
    title: deriveTitle(input),
    source: input.source,
    language: input.language,
    aspect: input.aspect,
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

  return {
    projectId,
    path: dir,
    storyboardPath: projectStoryboardPath(projectId),
  }
}

export { listProjects, type ProjectSummary }
export const DEFAULT_VOICE_FOR = DEFAULT_VOICES
