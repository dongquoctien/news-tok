/**
 * Cross-package path helpers for the `data/` directory.
 *
 * The repo stores all generated artefacts (cached assets, per-project
 * folders, render output) under a single `data/` root. AssetRefs in
 * `storyboard.json` historically held absolute paths
 * (`D:\Github\news-tok\data\cache\images\abc.jpg`) which broke
 * portability — moving the repo or sharing a storyboard between
 * machines invalidated every path.
 *
 * The new convention: AssetRef.path is **relative to `data/`** (e.g.
 * `cache/images/abc.jpg`). Producers convert paths via
 * `toRelativeDataPath(abs)` before writing; consumers convert back
 * with `resolveDataPath(rel)` before touching the filesystem. Both
 * helpers tolerate the legacy absolute form so old storyboards keep
 * working until the migration script (or the auto-normaliser on
 * read) rewrites them.
 *
 * This module lives in `@news-tok/shared` rather than `@news-tok/render`
 * because the sanitiser chain (also in `shared`) needs to relativise
 * paths during write, and circular dependencies between `shared` and
 * `render` are forbidden.
 */

import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, resolve, sep } from 'node:path'

// packages/shared/src/paths.ts -> repo root is 3 levels up.
const here = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(here, '..', '..', '..')
export const DATA_DIR = resolve(REPO_ROOT, 'data')

/**
 * Convert an absolute path under `data/` to its relative form. Returns
 * the input untouched when it isn't under `data/` (e.g. a foreign
 * upload, an http URL, a Windows drive letter outside the repo) so the
 * helper is safe to apply blindly across every AssetRef.
 *
 * Examples:
 *   D:\Github\news-tok\data\cache\images\abc.jpg → cache/images/abc.jpg
 *   /home/user/news-tok/data/cache/images/abc.jpg → cache/images/abc.jpg
 *   cache/images/abc.jpg → cache/images/abc.jpg (already relative, no-op)
 *   https://example.com/x.jpg → https://example.com/x.jpg (no-op)
 */
export function toRelativeDataPath(p: string): string {
  if (!p) return p
  // Already relative — assume it's good.
  if (!isAbsolute(p)) return p
  // Normalise to forward slashes so the comparison is OS-agnostic.
  const normalized = p.replace(/\\/g, '/')
  const dataPrefix = DATA_DIR.replace(/\\/g, '/') + '/'
  if (normalized.toLowerCase().startsWith(dataPrefix.toLowerCase())) {
    return normalized.slice(dataPrefix.length)
  }
  // Absolute but not under data/ — leave alone (might be a foreign
  // file the user dragged in from elsewhere; callers can decide
  // whether to copy or reject).
  return p
}

/**
 * Resolve an AssetRef.path back to an absolute filesystem path.
 * Absolute inputs pass through unchanged (legacy storyboards); relative
 * inputs are joined onto `data/`. Use this at every consumer boundary
 * (renderer, fs.read, /api/asset serve).
 */
export function resolveDataPath(p: string): string {
  if (!p) return p
  if (isAbsolute(p)) return p
  return resolve(DATA_DIR, p)
}

/**
 * Cheap predicate — true when `p` is the new relative form. Useful for
 * migration scripts to know whether a file still needs to be rewritten.
 */
export function isRelativeDataPath(p: string): boolean {
  return !!p && !isAbsolute(p) && !p.includes('://')
}

/**
 * Normalise path separators to forward slashes. AssetRef paths should
 * always use `/` on disk so JSON is stable across OSes; the helpers
 * above already do this for the data-relative case, but writers that
 * build paths by hand (vd test fixtures) can call this directly.
 */
export function posixifyPath(p: string): string {
  return p.split(sep).join('/')
}
