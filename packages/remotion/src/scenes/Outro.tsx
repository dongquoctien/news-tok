import { AbsoluteFill, Audio } from 'remotion'
import { Sparkles } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import type { SceneProps } from './types.js'
import { fontFor } from './fonts.js'
import { Fade } from '../effects/Fade.js'
import { KenBurns } from '../effects/KenBurns.js'
import { useEntranceSpring } from '../effects/timing.js'
import { useResponsive } from './sizing.js'

export const Outro = ({ segment, project }: SceneProps) => {
  const spring = useEntranceSpring({ damping: 12 })
  const r = useResponsive()
  const bg = segment.visuals.background
  const narration = segment.audio?.narration
  const fontFamily = fontFor(project.language)

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {bg ? <KenBurns src={bg.path} from={1.05} to={1.15} panX={0} panY={0.04} /> : null}
      <AbsoluteFill
        style={{
          background: bg
            ? 'radial-gradient(circle at 50% 50%, rgba(29,29,37,0.55) 0%, rgba(11,11,15,0.92) 70%)'
            : 'radial-gradient(circle at 50% 50%, #1d1d25 0%, #0b0b0f 70%)',
        }}
      />
      <AbsoluteFill
        style={{
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
      </AbsoluteFill>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
