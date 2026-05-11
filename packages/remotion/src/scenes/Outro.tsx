import { AbsoluteFill, Audio } from 'remotion'
import { Sparkles } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import type { SceneProps } from './types.js'
import { fontFor } from './fonts.js'
import { Fade } from '../effects/Fade.js'
import { useEntranceSpring } from '../effects/timing.js'
import { useResponsive } from './sizing.js'

export const Outro = ({ segment, project }: SceneProps) => {
  const spring = useEntranceSpring({ damping: 12 })
  const r = useResponsive()
  const narration = segment.audio?.narration
  const fontFamily = fontFor(project.language)

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 50%, #1d1d25 0%, #0b0b0f 70%)',
        color: '#f4f4f6',
        fontFamily,
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 80 * r.unit,
      }}
    >
      <Fade inSec={0.3} outSec={0.6}>
        <div
          style={{
            opacity: spring,
            transform: `scale(${0.85 + spring * 0.15})`,
          }}
        >
          <Sparkles
            size={ICON.xxl * 1.6 * r.unit}
            strokeWidth={ICON.strokeWidth}
            color="#a5b4fc"
            style={{ marginBottom: 32 * r.unit }}
          />
          <div
            style={{
              fontSize: 64 * r.font,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: -0.5,
              maxWidth: r.landscape ? '70%' : '100%',
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
