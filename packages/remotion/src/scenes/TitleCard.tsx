import { AbsoluteFill, Audio } from 'remotion'
import { Newspaper } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import type { SceneProps } from './types.js'
import { fontFor } from './fonts.js'
import { Fade } from '../effects/Fade.js'
import { useEntranceSpring } from '../effects/timing.js'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from './sizing.js'

export const TitleCard = ({ segment, project }: SceneProps) => {
  const spring = useEntranceSpring({ damping: 14 })
  const r = useResponsive()
  const bg = segment.visuals.background
  const narration = segment.audio?.narration
  const fontFamily = fontFor(project.language)

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {bg ? <KenBurns src={bg.path} from={1.08} to={1.18} panX={0.04} panY={-0.04} /> : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,11,15,0.2) 0%, rgba(11,11,15,0.6) 60%, rgba(11,11,15,0.92) 100%)',
        }}
      />
      <Fade inSec={0.4} outSec={0.4}>
        <AbsoluteFill
          style={{
            justifyContent: r.landscape ? 'center' : 'flex-end',
            padding: 80 * r.unit,
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
              fontSize: 28 * r.font,
              letterSpacing: 1,
              textTransform: 'uppercase',
              opacity: spring,
              transform: `translateY(${(1 - spring) * 30}px)`,
            }}
          >
            <Newspaper size={ICON.xl * r.unit} strokeWidth={ICON.strokeWidth} />
            {project.title || 'News'}
          </div>
          <div
            style={{
              marginTop: 24 * r.unit,
              fontSize: 84 * r.font,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              maxWidth: r.landscape ? '70%' : '100%',
              opacity: spring,
              transform: `translateY(${(1 - spring) * 60}px)`,
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
