import { Composition, type CalculateMetadataFunction } from 'remotion'
import {
  ASPECT_PRESETS,
  ProjectSchema,
  ThumbnailSchema,
  resolveRenderPreset,
  type Aspect,
  type Project,
  type Thumbnail,
} from '@news-tok/shared/schema'
import { NewsTokComposition, type NewsTokCompositionProps } from './compositions/NewsTokComposition.js'
import {
  ThumbnailComposition,
  type ThumbnailCompositionProps,
} from './compositions/ThumbnailComposition.js'

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
    // Match the per-segment guard in NewsTokComposition: never cut a
    // segment shorter than its narration + 0.2s safety, even if the
    // storyboard says otherwise. Keeps the composition long enough so
    // audio is never clipped on the last frame.
    const safetyFrames = Math.round(0.2 * preset.fps)
    const durationInFrames = storyboard.segments.reduce((sum, s) => {
      const planned = Math.max(1, Math.round(s.durationSec * preset.fps))
      const narrationSec = s.audio?.narration?.durationSec ?? 0
      const narration = narrationSec > 0 ? Math.ceil(narrationSec * preset.fps) : 0
      return sum + Math.max(planned, narration + safetyFrames)
    }, 0) || 1
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
      <Composition
        id="Thumbnail916"
        component={ThumbnailComposition}
        defaultProps={FALLBACK_THUMBNAIL_PROPS}
        fps={30}
        width={1080}
        height={1920}
        durationInFrames={1}
      />
    </>
  )
}

const FALLBACK_THUMBNAIL_PROPS: ThumbnailCompositionProps = {
  thumbnail: ThumbnailSchema.parse({
    layout: 'news-breaking',
    background: { kind: 'solid', color: '#0b0b0f' },
    edits: {
      title: 'Sample headline',
      eyebrow: 'NEWS',
      titleStyle: {
        x: 56,
        y: 980,
        width: 968,
        fontSize: 88,
        fontWeight: 900,
        color: '#ffffff',
        align: 'left',
        letterSpacing: -0.5,
        lineHeight: 1.08,
        uppercase: false,
      },
      eyebrowStyle: {
        x: 56,
        y: 880,
        width: 360,
        fontSize: 36,
        fontWeight: 900,
        color: '#ffffff',
        bgColor: '#E11D48',
        align: 'left',
        letterSpacing: 4,
        lineHeight: 1,
        uppercase: true,
      },
      vignette: 0.3,
      overlay: { color: '#000000', opacity: 0.35 },
    },
    watermark: {
      enabled: true,
      text: '@newstokvn',
      position: 'bottom-right',
      color: '#ffffff',
      fontSize: 32,
      bgColor: 'rgba(0,0,0,0.45)',
    },
  }) as Thumbnail,
  topic: 'generic',
}
