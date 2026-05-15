import { AbsoluteFill, Audio } from 'remotion'
import { Sparkles } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import { BUILT_IN_TEXT_STYLES, findTextStyle } from '@news-tok/shared/text-styles'
import type { SceneProps } from './types.js'
import { Fade } from '../effects/Fade.js'
import { KenBurns } from '../effects/KenBurns.js'
import { useEntranceSpring } from '../effects/timing.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from './sizing.js'
import { resolveLayout } from '../layouts/registry.js'

const CLASSIC = findTextStyle('cinematic', []) ?? findTextStyle('classic', []) ?? BUILT_IN_TEXT_STYLES[0]!

export const Outro = ({ segment, project, textStyle, fontOverride, colorOverride }: SceneProps) => {
  const spring = useEntranceSpring({ damping: 12 })
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
      {bg ? (
        <KenBurns
          src={bg.path}
          from={1.05}
          to={1.15}
          panX={0}
          panY={0.04}
          edits={segment.backgroundEdits}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: bg
            ? 'radial-gradient(circle at 50% 50%, rgba(29,29,37,0.55) 0%, rgba(11,11,15,0.92) 70%)'
            : 'radial-gradient(circle at 50% 50%, #1d1d25 0%, #0b0b0f 70%)',
        }}
      />
      <Fade inSec={0.3} outSec={0.6}>
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: 80 * r.unit,
            pointerEvents: 'none',
          }}
        >
          <Sparkles
            size={ICON.xxl * 1.6 * r.unit}
            strokeWidth={ICON.strokeWidth}
            color="#a5b4fc"
            style={{ opacity: spring, transform: `scale(${0.85 + spring * 0.15})` }}
          />
        </AbsoluteFill>
      </Fade>
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
