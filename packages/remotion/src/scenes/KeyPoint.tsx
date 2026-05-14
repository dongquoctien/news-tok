import { AbsoluteFill, Audio } from 'remotion'
import { ListChecks } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import { BUILT_IN_TEXT_STYLES, findTextStyle } from '@news-tok/shared/text-styles'
import type { SceneProps } from './types.js'
import { Fade } from '../effects/Fade.js'
import { KenBurns } from '../effects/KenBurns.js'
import { useEntranceSpring } from '../effects/timing.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from './sizing.js'
import { resolveLayout } from '../layouts/registry.js'

const CLASSIC = findTextStyle('classic', []) ?? BUILT_IN_TEXT_STYLES[0]!

export const KeyPoint = ({ segment, project, textStyle, fontOverride, colorOverride }: SceneProps) => {
  const spring = useEntranceSpring({ damping: 16 })
  const r = useResponsive()
  const bg = segment.visuals.background
  const narration = segment.audio?.narration
  const style = textStyle ?? CLASSIC

  if (segment.layoutId) {
    const Layout = resolveLayout(segment.layoutId)
    return (
      <Layout
        text={segment.text}
        eyebrow={segment.eyebrow}
        chips={segment.chips}
        fileId={segment.fileId}
        media={segment.visuals.background}
        textStyle={style}
        fontOverride={fontOverride}
        colorOverride={colorOverride}
        segment={segment}
        project={project}
      />
    )
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {bg ? <KenBurns src={bg.path} from={1.12} to={1.0} panX={-0.05} panY={0.05} /> : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,11,15,0.0) 0%, rgba(11,11,15,0.55) 70%, rgba(11,11,15,0.95) 100%)',
        }}
      />
      {project.showSceneBadges ? (
        <Fade inSec={0.35} outSec={0.35}>
          <AbsoluteFill
            style={{
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              padding: 72 * r.unit,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12 * r.unit,
                color: '#a5b4fc',
                fontWeight: 600,
                fontSize: 24 * r.font,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                opacity: spring,
                transform: `translateY(${(1 - spring) * 20}px)`,
              }}
            >
              <ListChecks size={ICON.lg * r.unit} strokeWidth={ICON.strokeWidth} />
              Key point
            </div>
          </AbsoluteFill>
        </Fade>
      ) : null}
      <TextBlock
        text={segment.text}
        style={style}
        wordBoundaries={segment.wordBoundaries}
        fontOverride={fontOverride}
        colorOverride={colorOverride}
      />
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
