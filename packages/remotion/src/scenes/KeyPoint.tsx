import { AbsoluteFill, Audio } from 'remotion'
import { ListChecks } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import type { SceneProps } from './types.js'
import { fontFor } from './fonts.js'
import { Fade } from '../effects/Fade.js'
import { KenBurns } from '../effects/KenBurns.js'
import { useEntranceSpring } from '../effects/timing.js'
import { useResponsive } from './sizing.js'

export const KeyPoint = ({ segment, project }: SceneProps) => {
  const spring = useEntranceSpring({ damping: 16 })
  const r = useResponsive()
  const bg = segment.visuals.background
  const narration = segment.audio?.narration
  const fontFamily = fontFor(project.language)

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {bg ? <KenBurns src={bg.path} from={1.12} to={1.0} panX={-0.05} panY={0.05} /> : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,11,15,0.0) 0%, rgba(11,11,15,0.55) 70%, rgba(11,11,15,0.95) 100%)',
        }}
      />
      <Fade inSec={0.35} outSec={0.35}>
        <AbsoluteFill
          style={{
            justifyContent: r.landscape ? 'center' : 'flex-end',
            padding: 72 * r.unit,
            color: '#f4f4f6',
            fontFamily,
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
          <div
            style={{
              marginTop: 20 * r.unit,
              fontSize: 64 * r.font,
              fontWeight: 600,
              lineHeight: 1.18,
              letterSpacing: -0.5,
              maxWidth: r.landscape ? '65%' : '100%',
              opacity: spring,
              transform: `translateY(${(1 - spring) * 50}px)`,
            }}
          >
            {segment.text}
          </div>
        </AbsoluteFill>
      </Fade>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
