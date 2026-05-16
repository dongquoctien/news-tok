/**
 * Scene CSS pipeline guard.
 *
 * Why: the project has TWO CSS pipelines that look identical in source.
 *   - apps/studio/**         → Tailwind v4 + shadcn/ui (PostCSS runs)
 *   - packages/remotion/scenes + data/projects/*\/scenes
 *                            → Remotion's own webpack, NO Tailwind
 *
 * Tailwind classes inside scene .tsx files render as either dropped
 * markup or literal text — and the failure surfaces only at video
 * render time, often after the slow `bundle()` step. This script
 * grep-fails the build if any scene file uses className=, so the
 * regression is caught at `pnpm check:scenes` time instead.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')

/**
 * Scene roots scanned by this guard. Keep in sync with the dynamic
 * scene resolver in packages/remotion/src/scenes/registry.ts — every
 * directory the resolver pulls from is a place where Tailwind classes
 * silently fail.
 */
const SCENE_ROOTS = [
  resolve(REPO_ROOT, 'packages/remotion/src/scenes'),
  resolve(REPO_ROOT, 'data/projects'),
]

const CLASSNAME_RE = /\bclassName\s*=/

type Hit = { file: string; line: number; snippet: string }

/**
 * Walk a directory tree, yielding every .tsx file. Skips node_modules
 * and dist as a defensive measure even though the scene roots aren't
 * supposed to contain them.
 *
 * For data/projects we additionally restrict to the `scenes/` subfolder
 * so storyboard JSON / library / segment artifacts aren't scanned —
 * those don't need the guard.
 */
async function* walkScenes(root: string, restrictToScenesDir: boolean): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return // root may not exist (e.g. data/projects on a fresh clone)
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue
    }
    const full = resolve(root, entry.name)
    if (entry.isDirectory()) {
      // For data/projects/<id>/, only descend into the scenes/ subfolder.
      if (restrictToScenesDir) {
        const scenesDir = resolve(full, 'scenes')
        try {
          const s = await stat(scenesDir)
          if (s.isDirectory()) {
            yield* walkScenes(scenesDir, false)
          }
        } catch {
          // no scenes dir for this project — skip
        }
      } else {
        yield* walkScenes(full, false)
      }
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      yield full
    }
  }
}

async function findHits(): Promise<Hit[]> {
  const hits: Hit[] = []
  for (const root of SCENE_ROOTS) {
    const restrictToScenesDir = root.endsWith('projects')
    for await (const file of walkScenes(root, restrictToScenesDir)) {
      const content = await readFile(file, 'utf8')
      const lines = content.split(/\r?\n/)
      lines.forEach((line, i) => {
        if (CLASSNAME_RE.test(line)) {
          hits.push({
            file: relative(REPO_ROOT, file),
            line: i + 1,
            snippet: line.trim().slice(0, 120),
          })
        }
      })
    }
  }
  return hits
}

async function main(): Promise<void> {
  const hits = await findHits()

  if (hits.length === 0) {
    console.log('[OK] check-scene-css — no className= found in scene files.')
    console.log('     Scanned:')
    for (const root of SCENE_ROOTS) {
      console.log(`       ${relative(REPO_ROOT, root) || '.'}`)
    }
    return
  }

  console.error(
    `\n[ERR] check-scene-css — found ${hits.length} occurrence(s) of className= in scene files.`
  )
  console.error(
    "       Scene files render under Remotion's webpack, which does NOT run Tailwind PostCSS."
  )
  console.error(
    '       Use inline `style={{...}}` sourced from `@news-tok/shared/ui-tokens` instead.\n'
  )
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}`)
    console.error(`    ${hit.snippet}`)
  }
  console.error('')
  process.exit(1)
}

main().catch((err) => {
  process.stderr.write(
    `check-scene-css failed: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(1)
})
