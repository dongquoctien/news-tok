/**
 * M6 smoke: build a fixture with subtitles enabled + wordBoundaries, render,
 * then exercise duplicate/delete. Verifies:
 *   - storyboard schema accepts new fields (subtitles, exportPreset, wordBoundaries)
 *   - render produces a non-trivial mp4
 *   - duplicateProject() creates a new id and copies non-render assets
 *   - deleteProject() removes the folder
 *
 * Run: pnpm smoke:m6
 */
import { existsSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import {
  DEFAULT_VOICES,
  ProjectSchema,
  type Project,
} from '@news-tok/shared/schema'
import {
  deleteProject,
  duplicateProject,
  projectDir,
  renderProjectMedia,
  writeStoryboard,
} from '@news-tok/render'

const PROJECT_ID = 'smoke-m6'

function fixture(): Project {
  const now = new Date().toISOString()
  return ProjectSchema.parse({
    id: PROJECT_ID,
    title: 'Subtitle smoke test',
    source: { type: 'text', value: 'Smoke fixture' },
    language: 'vi',
    aspect: '9:16',
    bgMusicVolume: 0.2,
    subtitles: { enabled: true, bottomPct: 0.18 },
    exportPreset: 'standard',
    createdAt: now,
    updatedAt: now,
    segments: [
      {
        id: 'seg-1',
        durationSec: 3,
        scene: 'title',
        text: 'Bản tin nhanh',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
        // Synthetic word boundaries matching the text so the Subtitles
        // overlay has something to show without needing a TTS round-trip.
        wordBoundaries: [
          { offsetSec: 0.2, durationSec: 0.6, text: 'Bản' },
          { offsetSec: 0.8, durationSec: 0.6, text: 'tin' },
          { offsetSec: 1.4, durationSec: 0.7, text: 'nhanh' },
        ],
      },
    ],
  })
}

async function cleanup(id: string) {
  if (existsSync(projectDir(id))) await rm(projectDir(id), { recursive: true, force: true })
}

async function main() {
  // Fresh start to avoid cached bundle confusion.
  await cleanup(PROJECT_ID)

  console.log('[m6] writing fixture with subtitles + word boundaries...')
  await writeStoryboard(PROJECT_ID, fixture())

  console.log('[m6] rendering 3s 9:16 with subtitles overlay...')
  const t0 = Date.now()
  const out = await renderProjectMedia(PROJECT_ID, {
    onProgress: (p) => {
      const pct = Math.floor(p * 100)
      if (pct % 25 === 0) console.log(`  progress: ${pct}%`)
    },
  })
  if (!existsSync(out)) throw new Error(`output missing: ${out}`)
  const size = statSync(out).size
  if (size < 10_000) throw new Error(`output suspiciously small: ${size} bytes`)
  console.log(`[m6] render ok — ${out} (${(size / 1024).toFixed(1)} KB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`)

  console.log('[m6] duplicateProject...')
  const dup = await duplicateProject(PROJECT_ID)
  if (!existsSync(dup.path)) throw new Error(`duplicate missing at ${dup.path}`)
  // Output should NOT be copied — it must be re-rendered.
  if (existsSync(`${dup.path}/output.mp4`)) {
    throw new Error('duplicate copied output.mp4 — should be skipped')
  }
  console.log(`[m6] duplicate ok — new id ${dup.projectId}`)

  console.log('[m6] deleteProject (the duplicate)...')
  await deleteProject(dup.projectId)
  if (existsSync(dup.path)) throw new Error(`delete failed: ${dup.path} still exists`)
  console.log('[m6] delete ok')

  console.log('[m6] all checks passed')
}

main().catch((err) => {
  console.error('[m6] failed:', err)
  process.exit(1)
})
