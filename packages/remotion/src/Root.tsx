import { Composition, type CalculateMetadataFunction } from 'remotion'
import {
  ASPECT_PRESETS,
  ProjectSchema,
  resolveRenderPreset,
  type Aspect,
  type Project,
} from '@news-tok/shared/schema'
import { NewsTokComposition, type NewsTokCompositionProps } from './compositions/NewsTokComposition.js'

const FALLBACK_PROJECT: Project = ProjectSchema.parse({
  id: 'placeholder',
  title: 'Placeholder',
  source: { type: 'text', value: '' },
  language: 'en',
  aspect: '9:16',
  segments: [
    {
      id: 'seg-1',
      durationSec: 3,
      scene: 'title',
      text: 'Open the Remotion Studio',
      voice: { provider: 'edge-tts', voiceId: 'en-US-AriaNeural', speed: 1 },
      visuals: {},
      effects: [],
    },
  ],
  bgMusicVolume: 0.2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

const calculateMetadata =
  (aspect: Aspect): CalculateMetadataFunction<NewsTokCompositionProps> =>
  async ({ props }) => {
    const parsed = ProjectSchema.safeParse(props.storyboard)
    const storyboard = parsed.success ? parsed.data : FALLBACK_PROJECT
    const preset = resolveRenderPreset(aspect, storyboard.exportPreset)
    const totalSec = storyboard.segments.reduce((sum, s) => sum + s.durationSec, 0)
    const durationInFrames = Math.max(1, Math.round(totalSec * preset.fps))
    return {
      durationInFrames,
      fps: preset.fps,
      width: preset.width,
      height: preset.height,
      // Preserve every caller-provided prop (variantId, sfxUrlMap, ...).
      // Dropping unknown keys here is what made every variant render
      // identically — the composition resolved variantId=undefined and
      // always fell back to variants[0].
      props: { ...props, storyboard },
    }
  }

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="NewsTok916"
        component={NewsTokComposition}
        defaultProps={{ storyboard: FALLBACK_PROJECT }}
        calculateMetadata={calculateMetadata('9:16')}
        fps={ASPECT_PRESETS['9:16'].fps}
        width={ASPECT_PRESETS['9:16'].width}
        height={ASPECT_PRESETS['9:16'].height}
        durationInFrames={90}
      />
      <Composition
        id="NewsTok169"
        component={NewsTokComposition}
        defaultProps={{ storyboard: FALLBACK_PROJECT }}
        calculateMetadata={calculateMetadata('16:9')}
        fps={ASPECT_PRESETS['16:9'].fps}
        width={ASPECT_PRESETS['16:9'].width}
        height={ASPECT_PRESETS['16:9'].height}
        durationInFrames={90}
      />
      <Composition
        id="NewsTok11"
        component={NewsTokComposition}
        defaultProps={{ storyboard: FALLBACK_PROJECT }}
        calculateMetadata={calculateMetadata('1:1')}
        fps={ASPECT_PRESETS['1:1'].fps}
        width={ASPECT_PRESETS['1:1'].width}
        height={ASPECT_PRESETS['1:1'].height}
        durationInFrames={90}
      />
    </>
  )
}
