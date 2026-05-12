import { copyFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUILT_IN_SFX, sfxFileName, type Project, type TextStyle } from '@news-tok/shared'
import { sfxBankDir, sfxStagingDir } from './paths.js'

/**
 * Walk every text style the project may use and collect distinct sfx ids
 * (enter + per-word). Includes built-in styles referenced by variants and
 * inline user-authored styles.
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
 * Copy SFX files from `packages/shared/sfx/<id>.mp3` into the publicDir
 * staging directory `data/sfx/<id>.mp3`. Files that do not exist in the
 * bank are skipped (the renderer will see no entry in the URL map and
 * treat them as silence). Returns the id → public URL map that goes into
 * the composition's inputProps.
 */
export async function stageSfxFiles(ids: string[]): Promise<Record<string, string>> {
  const bank = sfxBankDir()
  const stage = sfxStagingDir()
  await mkdir(stage, { recursive: true })
  const map: Record<string, string> = {}
  for (const id of ids) {
    const fileName = sfxFileName(id)
    const src = resolve(bank, fileName)
    if (!existsSync(src)) continue // silent fallback for empty bank entries
    const dst = resolve(stage, fileName)
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
    map[id] = `/public/sfx/${fileName}`
  }
  return map
}
