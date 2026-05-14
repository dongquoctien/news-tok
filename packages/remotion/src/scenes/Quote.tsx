import { AbsoluteFill, Audio } from 'remotion'
import { Quote as QuoteIcon } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import { BUILT_IN_TEXT_STYLES, findTextStyle } from '@news-tok/shared/text-styles'
import type { SceneProps } from './types.js'
import { Fade } from '../effects/Fade.js'
import { useEntranceSpring } from '../effects/timing.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from './sizing.js'
import { resolveLayout } from '../layouts/registry.js'

const CLASSIC = findTextStyle('quote-soft', []) ?? findTextStyle('classic', []) ?? BUILT_IN_TEXT_STYLES[0]!

export const Quote = ({ segment, project, textStyle, fontOverride, colorOverride }: SceneProps) => {
  const spring = useEntranceSpring({ damping: 14 })
  const r = useResponsive()
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
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #15151b 0%, #1d1d25 100%)',
        padding: 96 * r.unit,
      }}
    >
      <Fade inSec={0.4} outSec={0.4}>
        <AbsoluteFill
          style={{
            justifyContent: 'flex-start',
            alignItems: 'center',
            padding: 96 * r.unit,
            pointerEvents: 'none',
          }}
        >
          <QuoteIcon
            size={ICON.xxl * 1.4 * r.unit}
            strokeWidth={ICON.strokeWidth}
            color="#6366f1"
            style={{ opacity: spring }}
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
