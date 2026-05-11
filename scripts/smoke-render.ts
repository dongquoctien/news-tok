/**
 * M1 smoke test: render a 15-second video from a hardcoded storyboard with
 * Vietnamese text (to verify diacritics) using only built-in scenes.
 *
 * Run: pnpm smoke:render
 */
import { existsSync, statSync } from 'node:fs'
import {
  ProjectSchema,
  DEFAULT_VOICES,
  type Project,
} from '@news-tok/shared/schema'
import { renderProjectMedia, writeStoryboard } from '@news-tok/render'

const PROJECT_ID = 'smoke-m1'

function buildStoryboard(): Project {
  const now = new Date().toISOString()
  return ProjectSchema.parse({
    id: PROJECT_ID,
    title: 'Tin tức nóng hổi',
    source: { type: 'text', value: 'Smoke fixture' },
    language: 'vi',
    aspect: '9:16',
    bgMusicVolume: 0.2,
    createdAt: now,
    updatedAt: now,
    segments: [
      {
        id: 'seg-title',
        durationSec: 5,
        scene: 'title',
        text: 'Khoa học vũ trụ vừa có bước tiến mới',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
      },
      {
        id: 'seg-keypoint',
        durationSec: 5,
        scene: 'keypoint',
        text: 'Kính viễn vọng James Webb chụp được thiên hà xa nhất từng quan sát.',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
      },
      {
        id: 'seg-outro',
        durationSec: 5,
        scene: 'outro',
        text: 'Theo dõi để xem thêm tin công nghệ.',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
      },
    ],
  })
}

async function main() {
  const story = buildStoryboard()
  await writeStoryboard(PROJECT_ID, story)

  console.log(`[smoke] rendering project ${PROJECT_ID} (${story.aspect}, 15s, VI)...`)
  const t0 = Date.now()
  let lastPercent = -1
  const outPath = await renderProjectMedia(PROJECT_ID, {
    onProgress: (p) => {
      const percent = Math.floor(p * 100)
      if (percent !== lastPercent && percent % 10 === 0) {
        lastPercent = percent
        console.log(`[smoke]   progress: ${percent}%`)
      }
    },
  })
  const took = ((Date.now() - t0) / 1000).toFixed(1)

  if (!existsSync(outPath)) {
    throw new Error(`Render reported success but ${outPath} does not exist`)
  }
  const size = statSync(outPath).size
  if (size < 10_000) {
    throw new Error(`Output suspiciously small (${size} bytes): ${outPath}`)
  }

  console.log(`[smoke] ok — ${outPath} (${(size / 1024).toFixed(1)} KB, ${took}s)`)
}

main().catch((err) => {
  console.error('[smoke] failed:', err)
  process.exit(1)
})
