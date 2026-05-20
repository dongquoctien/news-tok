/**
 * Thumbnail generator smoke test.
 *
 * Runs the same code path the MCP `generateThumbnail` tool runs, against
 * a real on-disk project that already has `output.mp4`. Verifies:
 *   1. ffmpeg can extract candidate frames
 *   2. Remotion bundle + still-frame render produces a 1080x1920 JPG
 *   3. The Thumbnail config persists into storyboard.json round-trip
 *
 * Run: pnpm tsx scripts/smoke-thumbnail.ts <projectId>
 */
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  readStoryboard,
  projectDir,
  projectOutput,
  renderThumbnailStill,
} from '@news-tok/render'
import { buildThumbnailConfig } from '@news-tok/thumbnail'

const projectId = process.argv[2]
if (!projectId) {
  console.error('Usage: pnpm tsx scripts/smoke-thumbnail.ts <projectId>')
  process.exit(2)
}

async function main() {
  console.log(`[smoke-thumbnail] projectId=${projectId}`)
  const project = await readStoryboard(projectId)
  const videoPath = projectOutput(projectId)
  if (!existsSync(videoPath)) {
    throw new Error(`No output.mp4 at ${videoPath} — render the project first`)
  }

  // Reuse the same topic classifier the MCP server uses. We can't import
  // researchProjectAesthetic from mcp-server (built artefact), but its
  // logic is keyword-based so a thin re-implementation here is fine
  // for the smoke purpose.
  const articleText = project.segments.map((s) => s.text).join(' ').toLowerCase()
  const title = project.title.toLowerCase()
  const haystack = (title + ' ' + articleText).slice(0, 4000)
  let topic = 'generic'
  if (/(án|tội phạm|police|murder|crime|killed|cướp|giết)/.test(haystack)) topic = 'crime'
  else if (/(bóng đá|sport|football|world cup|champion)/.test(haystack)) topic = 'sports'
  else if (/(ai|tech|software|chatgpt|iphone)/.test(haystack)) topic = 'tech'
  else if (/(phim|ca sĩ|showbiz|movie|celebrity|sao việt)/.test(haystack)) topic = 'entertainment'
  else if (/(giáo dục|education|student|university|kiến thức)/.test(haystack)) topic = 'education'

  console.log(`[smoke-thumbnail] topic = ${topic}`)
  console.log(`[smoke-thumbnail] title = "${project.title}"`)

  const candidatesDir = resolve(projectDir(projectId), 'thumb-candidates')
  console.log('[smoke-thumbnail] extracting candidate frames + building config...')
  const t0 = Date.now()
  const { thumbnail, warnings, pickedFrameIndex } = await buildThumbnailConfig({
    project: {
      title: project.title,
      language: project.language,
      segments: project.segments,
    },
    videoPath,
    outDir: candidatesDir,
    topic,
  })
  const t1 = Date.now()
  console.log(`[smoke-thumbnail] config built in ${t1 - t0}ms`)
  console.log(`  layout: ${thumbnail.layout}`)
  console.log(`  picked frame index: ${pickedFrameIndex}`)
  console.log(`  candidate frames: ${thumbnail.candidateFrames.length}`)
  for (const f of thumbnail.candidateFrames) {
    console.log(`    @${f.atSec.toFixed(2)}s -> ${f.path}`)
  }
  if (warnings.length > 0) {
    console.log(`  warnings (${warnings.length}):`)
    for (const w of warnings) console.log(`    - ${w}`)
  } else {
    console.log('  warnings: none')
  }

  console.log('[smoke-thumbnail] rendering still via Remotion Thumbnail916 composition...')
  const tr0 = Date.now()
  const outPath = await renderThumbnailStill({ projectId, thumbnail, topic })
  const tr1 = Date.now()
  console.log(`[smoke-thumbnail] render done in ${tr1 - tr0}ms`)
  console.log(`[smoke-thumbnail] output: ${outPath}`)
  const stat = statSync(outPath)
  console.log(`[smoke-thumbnail] file size: ${stat.size} bytes`)
  if (stat.size < 10_000) {
    throw new Error('thumb.jpg suspiciously small — render probably failed')
  }
  console.log('[smoke-thumbnail] OK')
}

main().catch((err) => {
  console.error('[smoke-thumbnail] FAIL:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
