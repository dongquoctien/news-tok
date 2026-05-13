import { copyFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import type { Project } from '@news-tok/shared'
import { logoStagingDir } from './paths.js'

/**
 * Copy the project's watermark image (if any) into publicDir at a
 * deterministic per-project path so Remotion's bundler can resolve it.
 * Returns the public URL to feed into the composition's inputProps, or
 * undefined when the project has no image watermark.
 *
 * Text watermarks don't need staging — they render purely from props.
 */
export async function stageLogoImage(project: Project): Promise<string | undefined> {
  if (!project.logo || project.logo.kind !== 'image') return undefined
  const src = project.logo.path
  if (!existsSync(src)) return undefined

  const stage = logoStagingDir()
  await mkdir(stage, { recursive: true })

  // Preserve the extension so the staged URL's Content-Type lines up
  // with what the Remotion <Img> tag expects.
  const ext = extname(src) || '.png'
  const fileName = `${project.id}${ext}`
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
  return `/public/logo/${fileName}`
}
