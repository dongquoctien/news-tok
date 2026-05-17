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
/** Per-project image library — bulk-imported backgrounds users can
 *  pull from when editing segments. Hash-deduped by content. */
export const projectLibraryDir = (projectId: string) =>
  resolve(projectDir(projectId), 'library')
/** Where the watermark image is staged inside publicDir for Remotion. */
export const logoStagingDir = () => resolve(dataDir(), 'logo')
export const bundleCacheRoot = () => resolve(REPO_ROOT, '.remotion-cache')
export const sfxBankDir = () => resolve(REPO_ROOT, 'packages', 'shared', 'sfx')
/** Where SFX files are staged inside publicDir for Remotion to serve. */
export const sfxStagingDir = () => resolve(dataDir(), 'sfx')
/** Global pool of user-authored layouts. Each subfolder holds
 *  `layout.tsx` + `meta.json` + optional preview/reference files. */
export const layoutsDir = () => resolve(dataDir(), 'layouts')
export const layoutDir = (layoutId: string) => resolve(layoutsDir(), layoutId)
/** Source directory holding versioned brand assets (logo, etc.) that
 *  every render needs. Files are copied into publicDir at stage time so
 *  the renderer's bundler can serve them via `staticFile('<name>')` —
 *  same URL convention Studio's Next.js public folder uses. */
export const brandAssetsSrcDir = () =>
  resolve(REPO_ROOT, 'packages', 'remotion', 'src', 'assets')
