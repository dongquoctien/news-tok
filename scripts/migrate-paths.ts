#!/usr/bin/env tsx
/**
 * One-shot migration: rewrite every storyboard.json's AssetRef paths
 * from the legacy absolute form (`D:\\Github\\news-tok\\data\\cache\\...`)
 * to the new relative-to-`data/` form (`cache/...`). After this runs,
 * projects survive being moved between machines without breaking
 * every asset reference.
 *
 * Studio PATCH + MCP updateStoryboard already auto-migrate on save
 * via the `normalizeAssetPaths` sanitiser; this script is the bulk
 * variant for users who want every project migrated at once instead
 * of waiting for the next save.
 *
 * Idempotent — already-migrated storyboards are detected (zero
 * `converted` returned by the sanitiser) and skipped. Safe to re-run.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-paths.ts          # migrate all projects
 *   pnpm tsx scripts/migrate-paths.ts --dry    # show what would change
 *   pnpm tsx scripts/migrate-paths.ts <id>     # migrate one project
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ProjectSchema, type Project } from '@news-tok/shared/schema'
import { normalizeAssetPaths } from '@news-tok/shared/sanitize'
import { dataDir, projectsDir, projectStoryboardPath } from '@news-tok/render'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry') || argv.includes('--dry-run')
const onlyId = argv.find((a) => !a.startsWith('--'))

async function loadProject(id: string): Promise<Project | null> {
  const path = projectStoryboardPath(id)
  if (!existsSync(path)) return null
  const raw = await readFile(path, 'utf8')
  const parsed = ProjectSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    process.stderr.write(
      `  skip — schema invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}\n`
    )
    return null
  }
  return parsed.data
}

async function migrateOne(id: string): Promise<{ converted: number }> {
  process.stdout.write(`${id}…`)
  const project = await loadProject(id)
  if (!project) {
    process.stdout.write(' SKIP (missing or invalid)\n')
    return { converted: 0 }
  }
  const { project: next, converted } = normalizeAssetPaths(project, dataDir())
  if (converted === 0) {
    process.stdout.write(' OK (already migrated)\n')
    return { converted: 0 }
  }
  if (dryRun) {
    process.stdout.write(` DRY (would rewrite ${converted} path${converted === 1 ? '' : 's'})\n`)
    return { converted }
  }
  const path = projectStoryboardPath(id)
  await writeFile(path, JSON.stringify(next, null, 2), 'utf8')
  process.stdout.write(` ✓ rewrote ${converted} path${converted === 1 ? '' : 's'}\n`)
  return { converted }
}

async function main() {
  let projectIds: string[]
  if (onlyId) {
    projectIds = [onlyId]
  } else {
    const root = projectsDir()
    if (!existsSync(root)) {
      process.stdout.write(`No projects directory at ${root} — nothing to migrate.\n`)
      return
    }
    const entries = await readdir(root, { withFileTypes: true })
    projectIds = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  }

  if (projectIds.length === 0) {
    process.stdout.write('No projects found.\n')
    return
  }

  process.stdout.write(
    `${dryRun ? 'DRY RUN — ' : ''}Migrating ${projectIds.length} project${
      projectIds.length === 1 ? '' : 's'
    } to relative-path form…\n\n`
  )

  let totalConverted = 0
  for (const id of projectIds) {
    const { converted } = await migrateOne(id)
    totalConverted += converted
  }

  process.stdout.write(
    `\n${dryRun ? 'Would convert' : 'Converted'} ${totalConverted} path${
      totalConverted === 1 ? '' : 's'
    } across ${projectIds.length} project${projectIds.length === 1 ? '' : 's'}.\n`
  )
  if (dryRun && totalConverted > 0) {
    process.stdout.write('Re-run without --dry to apply.\n')
  }
}

main().catch((err) => {
  process.stderr.write(`Migration failed: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
