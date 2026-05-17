import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

/**
 * The picker categories that support favorites. Adding a new category
 * here automatically extends `FavoritesFile` and the API contract;
 * the picker UI needs to import it and call `useFavorites(kind)`.
 */
export const FAVORITE_KINDS = ['layouts', 'styles', 'fonts', 'music', 'sfx'] as const
export type FavoriteKind = (typeof FAVORITE_KINDS)[number]

export type FavoritesFile = {
  /** Schema version — bump if the shape changes incompatibly. */
  version: 1
  /** Per-kind id lists. Order = insertion order (UI sorts favorites
   *  to the top of the picker grid in this order). */
  layouts: string[]
  styles: string[]
  fonts: string[]
  music: string[]
  sfx: string[]
}

const EMPTY: FavoritesFile = {
  version: 1,
  layouts: [],
  styles: [],
  fonts: [],
  music: [],
  sfx: [],
}

/**
 * Resolve the favorites file path. Lives outside the repo on purpose
 * — per-user, shared across every news-tok project the user opens.
 *
 * Override via `NEWS_TOK_FAVORITES_PATH` for tests so they don't
 * trample the user's real file.
 */
export function favoritesPath(): string {
  const override = process.env.NEWS_TOK_FAVORITES_PATH
  if (override) return resolve(override)
  return resolve(homedir(), '.news-tok', 'favorites.json')
}

/**
 * Read the favorites file. Treats every failure as "no favorites yet"
 * so a corrupted JSON or missing file never blocks Studio from
 * loading. Unknown fields from a future version are dropped silently;
 * known fields fill from the on-disk array if present.
 */
export async function readFavorites(): Promise<FavoritesFile> {
  const path = favoritesPath()
  if (!existsSync(path)) return { ...EMPTY }
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<FavoritesFile>
    return {
      version: 1,
      layouts: arr(parsed.layouts),
      styles: arr(parsed.styles),
      fonts: arr(parsed.fonts),
      music: arr(parsed.music),
      sfx: arr(parsed.sfx),
    }
  } catch {
    return { ...EMPTY }
  }
}

/**
 * Write the favorites file. Creates the parent directory the first
 * time; the file itself is small (<5KB even with hundreds of
 * favorites) so an atomic rename is overkill — a direct overwrite is
 * fine.
 */
export async function writeFavorites(file: FavoritesFile): Promise<void> {
  const path = favoritesPath()
  await mkdir(dirname(path), { recursive: true })
  // Normalise: dedupe + keep insertion order. Callers may push the
  // same id twice in optimistic-update scenarios.
  const normalised: FavoritesFile = {
    version: 1,
    layouts: dedupe(file.layouts),
    styles: dedupe(file.styles),
    fonts: dedupe(file.fonts),
    music: dedupe(file.music),
    sfx: dedupe(file.sfx),
  }
  await writeFile(path, JSON.stringify(normalised, null, 2), 'utf8')
}

/** Toggle one id in one category. Returns the updated file. */
export async function toggleFavorite(
  kind: FavoriteKind,
  id: string
): Promise<FavoritesFile> {
  const file = await readFavorites()
  const list = file[kind]
  const next = list.includes(id)
    ? list.filter((x) => x !== id)
    : [...list, id]
  const updated: FavoritesFile = { ...file, [kind]: next }
  await writeFavorites(updated)
  return updated
}

function arr(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

function dedupe(input: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of input) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
