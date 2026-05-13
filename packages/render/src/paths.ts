import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Resolve repo root by walking up from this file: packages/render/src/paths.ts
const here = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(here, '..', '..', '..')

export const dataDir = () => resolve(REPO_ROOT, 'data')
export const projectsDir = () => resolve(dataDir(), 'projects')
export const projectDir = (projectId: string) => resolve(projectsDir(), projectId)
export const projectScenesDir = (projectId: string) => resolve(projectDir(projectId), 'scenes')
export const projectSegmentsDir = (projectId: string) =>
  resolve(projectDir(projectId), 'segments')
export const projectOutput = (projectId: string) => resolve(projectDir(projectId), 'output.mp4')
export const projectStoryboardPath = (projectId: string) =>
  resolve(projectDir(projectId), 'storyboard.json')
export const projectSfxDir = (projectId: string) =>
  resolve(projectDir(projectId), 'sfx')
export const bundleCacheRoot = () => resolve(REPO_ROOT, '.remotion-cache')
export const sfxBankDir = () => resolve(REPO_ROOT, 'packages', 'shared', 'sfx')
/** Where SFX files are staged inside publicDir for Remotion to serve. */
export const sfxStagingDir = () => resolve(dataDir(), 'sfx')
