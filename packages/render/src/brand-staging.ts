import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { brandAssetsSrcDir, dataDir } from './paths.js'

/**
 * Copy the news-tok brand assets (logo, etc.) into the renderer's
 * publicDir at the *root*, so layouts can reference them with the
 * same `/<file>` URL Studio's Next public folder uses.
 *
 * Mirrors `stageSfxFiles` for SFX and `stageLogoImage` for per-project
 * watermarks, but the source is the committed
 * `packages/remotion/src/assets/` directory — every render gets the
 * same brand kit regardless of which project ran it.
 *
 * Skips when target file already exists and the mtime matches the
 * source; cheap on repeat renders.
 */
export async function stageBrandAssets(): Promise<void> {
  const src = brandAssetsSrcDir()
  if (!existsSync(src)) return
  const dst = dataDir()
  await mkdir(dst, { recursive: true })

  const entries = await readdir(src, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isFile()) continue
    const srcPath = resolve(src, e.name)
    const dstPath = resolve(dst, e.name)
    const srcStat = await stat(srcPath)
    let needsCopy = true
    if (existsSync(dstPath)) {
      try {
        const dstStat = await stat(dstPath)
        if (dstStat.size === srcStat.size && dstStat.mtimeMs >= srcStat.mtimeMs) {
          needsCopy = false
        }
      } catch {
        // re-copy
      }
    }
    if (needsCopy) await copyFile(srcPath, dstPath)
  }
}
