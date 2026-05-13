import { copyFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUILT_IN_SFX, sfxFileName, type Project, type TextStyle } from '@news-tok/shared'
import { sfxBankDir, sfxStagingDir } from './paths.js'

/**
 * Walk every text style the project may use and collect distinct sfx ids
 * (enter + per-word). Includes built-in styles referenced by variants and
 * inline user-authored styles. Custom SFX entries are not part of the
 * "used" set per style, but `stageSfxFiles` still copies them onto disk
 * because segments can reference them via `sfxOverride`.
 */
export function collectUsedSfxIds(project: Project): string[] {
  const ids = new Set<string>()
  const styles: TextStyle[] = []
  for (const style of project.userTextStyles ?? []) styles.push(style)
  for (const v of project.variants ?? []) {
    for (const styleId of Object.values(v.textStyleBySceneKind)) {
      const found = BUILT_IN_SFX.find((s) => s.id === styleId)
      if (found) {
        // No-op — built-in styles are looked up by their own id, not by sfx id.
      }
    }
  }
  // Easier: scan every built-in style (small list) since users may pick any of them.
  const inlineSfx = (s: TextStyle) => {
    if (s.sfx?.enterSoundId) ids.add(s.sfx.enterSoundId)
    if (s.sfx?.perWordSoundId) ids.add(s.sfx.perWordSoundId)
  }
  styles.forEach(inlineSfx)
  // Built-ins: include all sfx ids — keeps the URL map small and the bundle
  // cache key stable across variant swaps.
  for (const s of BUILT_IN_SFX) ids.add(s.id)
  return [...ids]
}

/**
 * Copy SFX files into the publicDir staging directory `data/sfx/<id>.mp3`.
 * Two sources are merged:
 *   1. Built-in bank — `packages/shared/sfx/<id>.mp3` for every id in `ids`.
 *   2. Project-scoped custom SFX — `project.customSfx[].path`, copied under
 *      their slug so the picker and the composition can reference them by
 *      id the same way they do built-ins.
 *
 * Files that do not exist on disk are silently skipped (the composition will
 * see no entry in the URL map and treat them as silence). Returns the id →
 * public URL map that goes into the composition's inputProps.
 */
export async function stageSfxFiles(
  ids: string[],
  project?: Project
): Promise<Record<string, string>> {
  const bank = sfxBankDir()
  const stage = sfxStagingDir()
  await mkdir(stage, { recursive: true })
  const map: Record<string, string> = {}

  const copyIfNeeded = async (src: string, dst: string): Promise<boolean> => {
    if (!existsSync(src)) return false
    const srcStat = await stat(src)
    let needsCopy = true
    if (existsSync(dst)) {
      try {
        const dstStat = await stat(dst)
        if (dstStat.size === srcStat.size && dstStat.mtimeMs >= srcStat.mtimeMs) {
          needsCopy = false
        }
      } catch {
        // fall through and re-copy
      }
    }
    if (needsCopy) await copyFile(src, dst)
    return true
  }

  // Built-in bank
  for (const id of ids) {
    const fileName = sfxFileName(id)
    const src = resolve(bank, fileName)
    const dst = resolve(stage, fileName)
    if (await copyIfNeeded(src, dst)) {
      map[id] = `/public/sfx/${fileName}`
    }
  }

  // Custom per-project SFX
  for (const entry of project?.customSfx ?? []) {
    const fileName = sfxFileName(entry.id)
    const dst = resolve(stage, fileName)
    if (await copyIfNeeded(entry.path, dst)) {
      map[entry.id] = `/public/sfx/${fileName}`
    }
  }

  return map
}
