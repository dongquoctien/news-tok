import { bundle } from '@remotion/bundler'
import { createHash } from 'node:crypto'
import { mkdir, readdir, writeFile, stat, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  bundleCacheRoot,
  dataDir,
  layoutsDir,
  projectScenesDir,
  projectStoryboardPath,
  REPO_ROOT,
  sfxStagingDir,
} from './paths.js'

// Stage temp entry files inside packages/remotion so module resolution finds
// `remotion`, `react`, `@news-tok/*` via pnpm's nested node_modules.
const ENTRY_STAGING_ROOT = resolve(REPO_ROOT, 'packages', 'remotion', '.entry-cache')

async function listCustomScenes(projectId: string): Promise<{ name: string; path: string }[]> {
  const dir = projectScenesDir(projectId)
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => ({
      name: e.name.replace(/\.tsx?$/, ''),
      path: resolve(dir, e.name),
    }))
}

/**
 * Scan the global `data/layouts/` pool. Each layout lives in its own
 * subfolder containing a `layout.tsx` (the React component) plus
 * sidecar files (`meta.json`, optional `reference/`). User layouts are
 * NOT project-scoped — the same pool is available to every render.
 *
 * The returned `name` is the layout id (folder name), e.g.
 * `user-scoreboard`, ready to use as the key in
 * `__NEWS_TOK_USER_LAYOUTS__`.
 */
async function listUserLayouts(): Promise<{ name: string; path: string }[]> {
  const root = layoutsDir()
  if (!existsSync(root)) return []
  const entries = await readdir(root, { withFileTypes: true })
  const out: { name: string; path: string }[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const tsx = resolve(root, e.name, 'layout.tsx')
    if (existsSync(tsx)) out.push({ name: e.name, path: tsx })
  }
  return out
}

/**
 * Hash the built-in Remotion layout + scene source files. Without
 * this the bundle cache only invalidates on custom-scene or
 * user-layout changes — adding a new file to
 * `packages/remotion/src/layouts/` (a built-in registered in
 * `registry.ts`) leaves the existing cache hit on disk, and the
 * next render keeps using a stale bundle that has no idea the new
 * layout exists. Symptom: segments with the new `layoutId` fall
 * back to FullBleed silently and render only the headline.
 *
 * We hash the entire `layouts/` + `scenes/` directories so editing
 * a single file invalidates the cache. Adds ~5ms to the bundle
 * path; ignored when the dirs don't exist (e.g. running from a
 * minimal fixture).
 */
async function hashBuiltInRemotion(): Promise<string> {
  // Top-level dirs whose IMMEDIATE files we hash (flat scan).
  const flatDirs = [
    resolve(REPO_ROOT, 'packages', 'remotion', 'src', 'layouts'),
    resolve(REPO_ROOT, 'packages', 'remotion', 'src', 'scenes'),
    resolve(REPO_ROOT, 'packages', 'remotion', 'src', 'compositions'),
    // @news-tok/thumbnail is consumed by the Remotion bundle through
    // ThumbnailComposition.tsx — without hashing the source here, the
    // bundler cache holds onto a stale React tree after edits to
    // layouts/decorators.tsx or ThumbnailRenderer.tsx and the renderer
    // silently reuses the previous bundle.
    resolve(REPO_ROOT, 'packages', 'thumbnail', 'src'),
    resolve(REPO_ROOT, 'packages', 'thumbnail', 'src', 'layouts'),
  ]
  const h = createHash('sha256')
  let touched = false
  for (const dir of flatDirs) {
    if (!existsSync(dir)) continue
    const entries = await readdir(dir, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
      .map((e) => e.name)
      .sort()
    for (const name of files) {
      const full = resolve(dir, name)
      try {
        const st = await stat(full)
        h.update(name)
        h.update('|')
        h.update(String(st.size))
        h.update('|')
        h.update(String(st.mtimeMs))
        h.update('\n')
        touched = true
      } catch {
        // file vanished between readdir and stat — skip
      }
    }
  }
  if (!touched) return ''
  return h.digest('hex').slice(0, 16)
}

async function hashUserLayouts(layouts: { name: string; path: string }[]): Promise<string> {
  if (layouts.length === 0) return ''
  const h = createHash('sha256')
  for (const l of layouts) {
    h.update(l.name)
    h.update('|')
    const st = await stat(l.path)
    h.update(String(st.size))
    h.update('|')
    h.update(String(st.mtimeMs))
    h.update('\n')
  }
  return h.digest('hex').slice(0, 16)
}

async function hashScenes(scenes: { name: string; path: string }[]): Promise<string> {
  if (scenes.length === 0) return ''
  const h = createHash('sha256')
  for (const s of scenes) {
    h.update(s.name)
    h.update('|')
    const st = await stat(s.path)
    h.update(String(st.size))
    h.update('|')
    h.update(String(st.mtimeMs))
    h.update('\n')
  }
  return h.digest('hex').slice(0, 16)
}

/**
 * Hash the set of asset files this project references in its storyboard.
 * Remotion's bundler snapshots the `publicDir` listing into a runtime
 * `window.remotion_staticFiles` registry; if a project downloads new
 * assets after the bundle was cached, those files won't resolve via
 * `staticFile()` / `<Img src="/public/...">`. Including the storyboard's
 * asset paths in the cache key forces a rebundle whenever the set
 * changes.
 */
async function hashStoryboardAssets(projectId: string): Promise<string> {
  const path = projectStoryboardPath(projectId)
  if (!existsSync(path)) return ''
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return ''
  }
  // Extract every "path": "..." occurrence — cheap and tolerant to schema
  // additions (avoids parsing the whole project).
  const matches = raw.match(/"path"\s*:\s*"((?:\\.|[^"\\])*)"/g) ?? []
  const paths = Array.from(new Set(matches.map((m) => m.replace(/^"path"\s*:\s*"|"$/g, ''))))
  if (paths.length === 0) return ''
  paths.sort()
  const h = createHash('sha256')
  for (const p of paths) h.update(p + '\n')
  return h.digest('hex').slice(0, 12)
}

/**
 * Hash the staged SFX directory (data/sfx). Remotion's bundler snapshots
 * publicDir at bundle time, so a project that bundled while data/sfx was
 * empty (or missing files later added to the bank) keeps that snapshot
 * forever and 404s on the missing cues. Including the staged file list
 * in the cache key forces a rebundle whenever the bank is repopulated.
 */
async function hashSfxStaging(): Promise<string> {
  const dir = sfxStagingDir()
  if (!existsSync(dir)) return ''
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return ''
  }
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.mp3'))
    .map((e) => e.name)
    .sort()
  if (files.length === 0) return ''
  const h = createHash('sha256')
  for (const name of files) {
    h.update(name)
    h.update('|')
    try {
      const st = await stat(resolve(dir, name))
      h.update(String(st.size))
    } catch {
      h.update('?')
    }
    h.update('\n')
  }
  return h.digest('hex').slice(0, 12)
}

function joinHashParts(...parts: string[]): string {
  const nonEmpty = parts.filter(Boolean)
  return nonEmpty.length === 0 ? 'base' : nonEmpty.join('-')
}

function entrySource(
  scenes: { name: string; path: string }[],
  layouts: { name: string; path: string }[]
): string {
  // The bundler validates that the entry contains the literal string
  // "registerRoot" — `import '@news-tok/remotion'` triggers the actual
  // registerRoot call inside that package. We also include a benign
  // mention here so the validator passes regardless of bundler version.
  const sceneImports = scenes
    .map((s, i) => `import Scene${i} from ${JSON.stringify(s.path.replace(/\\/g, '/'))}`)
    .join('\n')
  const sceneMap = scenes
    .map((s, i) => `  ${JSON.stringify(s.name)}: Scene${i}`)
    .join(',\n')
  const layoutImports = layouts
    .map((l, i) => `import Layout${i} from ${JSON.stringify(l.path.replace(/\\/g, '/'))}`)
    .join('\n')
  const layoutMap = layouts
    .map((l, i) => `  ${JSON.stringify(l.name)}: Layout${i}`)
    .join(',\n')
  return `// AUTO-GENERATED — Remotion entry with optional per-project custom
// scenes and the global user-layout pool.
// (registerRoot is invoked inside @news-tok/remotion.)
${sceneImports}
${layoutImports}
;(globalThis).__NEWS_TOK_CUSTOM_SCENES__ = {
${sceneMap}
}
;(globalThis).__NEWS_TOK_USER_LAYOUTS__ = {
${layoutMap}
}
import '@news-tok/remotion'
export {}
`
}

/**
 * Bundle the Remotion project, optionally including per-project custom scenes.
 * Returns the path to the bundle directory.
 */
export async function bundleForProject(projectId: string): Promise<string> {
  const scenes = await listCustomScenes(projectId)
  const layouts = await listUserLayouts()
  const sceneHash = await hashScenes(scenes)
  const layoutHash = await hashUserLayouts(layouts)
  // Built-in layouts + scenes — invalidates whenever a file in
  // packages/remotion/src/layouts/ or scenes/ changes. Without this
  // adding `BreakingNews.tsx` and registering it doesn't bust the
  // cache, so renders use the previously-bundled layout list.
  const builtInHash = await hashBuiltInRemotion()
  const assetsHash = await hashStoryboardAssets(projectId)
  const sfxHash = await hashSfxStaging()
  const cacheKey = joinHashParts(
    sceneHash,
    layoutHash,
    builtInHash,
    assetsHash,
    sfxHash
  )
  const outDir = resolve(bundleCacheRoot(), cacheKey)

  if (existsSync(resolve(outDir, 'index.html'))) {
    return outDir
  }
  await mkdir(outDir, { recursive: true })

  await mkdir(ENTRY_STAGING_ROOT, { recursive: true })
  const entryPath = resolve(ENTRY_STAGING_ROOT, `entry-${cacheKey}.tsx`)
  await writeFile(entryPath, entrySource(scenes, layouts), 'utf8')

  return bundle({
    entryPoint: entryPath,
    outDir,
    publicDir: dataDir(),
    onProgress: () => {},
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        // Allow TS source to use ".js" specifiers (NodeNext / Bundler style)
        // by mapping them onto the actual .ts / .tsx file.
        extensionAlias: {
          ...(config.resolve?.extensionAlias ?? {}),
          '.js': ['.ts', '.tsx', '.js'],
        },
      },
    }),
    ignoreRegisterRootWarning: true,
  })
}

export function bundleOutDirForHash(hash: string): string {
  return resolve(bundleCacheRoot(), hash || 'base')
}
