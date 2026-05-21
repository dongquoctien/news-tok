/**
 * Smoke test: validate that each project aspect ('9:16' | '16:9' | '1:1')
 * resolves to a Remotion composition with the expected resolution.
 *
 * We don't actually render frames — that's slow and covered by
 * `smoke:render`. Instead we bundle a tiny project per aspect, run
 * `selectComposition`, and verify the returned width/height match
 * `ASPECT_PRESETS`. This catches regressions in:
 *   - Root.tsx not registering the composition id (`NewsTok11`).
 *   - calculateMetadata not honouring the project's aspect.
 *   - resolveRenderPreset returning the wrong dims for an aspect.
 *
 * Run: pnpm smoke:aspect
 */
import { selectComposition } from '@remotion/renderer'
import {
  ASPECT_PRESETS,
  ProjectSchema,
  DEFAULT_VOICES,
  type Aspect,
  type Project,
} from '@news-tok/shared/schema'
import { bundleForProject, writeStoryboard } from '@news-tok/render'

const CASES: Array<{ aspect: Aspect; compositionId: string }> = [
  { aspect: '9:16', compositionId: 'NewsTok916' },
  { aspect: '16:9', compositionId: 'NewsTok169' },
  { aspect: '1:1', compositionId: 'NewsTok11' },
]

function buildStoryboard(projectId: string, aspect: Aspect): Project {
  const now = new Date().toISOString()
  return ProjectSchema.parse({
    id: projectId,
    title: `Aspect smoke ${aspect}`,
    source: { type: 'text', value: 'Smoke fixture' },
    language: 'vi',
    aspect,
    bgMusicVolume: 0.2,
    createdAt: now,
    updatedAt: now,
    segments: [
      {
        id: 'seg-1',
        durationSec: 3,
        scene: 'title',
        text: 'Smoke',
        voice: { provider: 'edge-tts', voiceId: DEFAULT_VOICES.vi, speed: 1 },
        visuals: {},
        effects: [],
      },
    ],
  })
}

async function main() {
  let failures = 0
  for (const { aspect, compositionId } of CASES) {
    const preset = ASPECT_PRESETS[aspect]
    const projectId = `smoke-aspect-${aspect.replace(':', 'x')}`
    console.log(`[smoke] ${aspect} → composition ${compositionId} (${preset.width}x${preset.height})`)

    await writeStoryboard(projectId, buildStoryboard(projectId, aspect))
    const serveUrl = await bundleForProject(projectId)
    const inputProps = { storyboard: buildStoryboard(projectId, aspect) }
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps,
    })

    const widthOk = composition.width === preset.width
    const heightOk = composition.height === preset.height
    const fpsOk = composition.fps === preset.fps

    if (widthOk && heightOk && fpsOk) {
      console.log(
        `[smoke]   ok — ${composition.width}x${composition.height} @ ${composition.fps}fps`
      )
    } else {
      failures += 1
      console.error(
        `[smoke]   FAIL — got ${composition.width}x${composition.height} @ ${composition.fps}fps, ` +
          `expected ${preset.width}x${preset.height} @ ${preset.fps}fps`
      )
    }
  }

  if (failures > 0) {
    console.error(`[smoke] ${failures} case(s) failed`)
    process.exit(1)
  }
  console.log('[smoke] ok — all 3 aspects round-trip cleanly')
}

main().catch((err) => {
  console.error('[smoke] failed:', err)
  process.exit(1)
})
