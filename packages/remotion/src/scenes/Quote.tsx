import { AbsoluteFill, Audio } from 'remotion'
import { Quote as QuoteIcon } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import type { SceneProps } from './types.js'
import { fontFor } from './fonts.js'
import { Fade } from '../effects/Fade.js'
import { useEntranceSpring } from '../effects/timing.js'
import { useResponsive } from './sizing.js'

export const Quote = ({ segment, project }: SceneProps) => {
  const spring = useEntranceSpring({ damping: 14 })
  const r = useResponsive()
  const narration = segment.audio?.narration
  const fontFamily = fontFor(project.language)

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #15151b 0%, #1d1d25 100%)',
        color: '#f4f4f6',
        fontFamily,
        padding: 96 * r.unit,
        justifyContent: 'center',
      }}
    >
      <Fade inSec={0.4} outSec={0.4}>
        <div style={{ maxWidth: r.landscape ? '70%' : '100%' }}>
          <QuoteIcon
            size={ICON.xxl * 1.4 * r.unit}
            strokeWidth={ICON.strokeWidth}
            color="#6366f1"
            style={{ opacity: spring }}
          />
          <div
            style={{
              marginTop: 24 * r.unit,
              fontSize: 56 * r.font,
              fontWeight: 600,
              lineHeight: 1.3,
              letterSpacing: -0.5,
              opacity: spring,
              transform: `translateY(${(1 - spring) * 40}px)`,
            }}
          >
            {segment.text}
          </div>
        </div>
      </Fade>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
