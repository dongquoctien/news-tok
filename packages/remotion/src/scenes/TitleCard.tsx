import { AbsoluteFill, Audio } from 'remotion'
import { Newspaper } from 'lucide-react'
import { ICON } from '@news-tok/shared/ui-tokens'
import { BUILT_IN_TEXT_STYLES, findTextStyle } from '@news-tok/shared/text-styles'
import type { SceneProps } from './types.js'
import { Fade } from '../effects/Fade.js'
import { useEntranceSpring } from '../effects/timing.js'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from './sizing.js'
import { resolveLayout } from '../layouts/registry.js'

const CLASSIC = findTextStyle('classic', []) ?? BUILT_IN_TEXT_STYLES[0]!

export const TitleCard = ({
  segment,
  project,
  textStyle,
  fontOverride,
  colorOverride,
  brandLogoUrl,
}: SceneProps) => {
  const spring = useEntranceSpring({ damping: 14 })
  const r = useResponsive()
  const bg = segment.visuals.background
  const narration = segment.audio?.narration
  const style = textStyle ?? CLASSIC

  // When the segment opts into a layout, hand off the entire render
  // to that layout component. The scene wrapper's KenBurns + badge
  // belong to the legacy "scene-owns-everything" path and don't
  // apply when a layout is in charge — the layout owns its own
  // chrome.
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
        brandLogoUrl={brandLogoUrl}
      />
    )
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {bg ? (
        <KenBurns
          src={bg.path}
          from={1.08}
          to={1.18}
          panX={0.04}
          panY={-0.04}
          edits={segment.backgroundEdits}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,11,15,0.2) 0%, rgba(11,11,15,0.6) 60%, rgba(11,11,15,0.92) 100%)',
        }}
      />
      {project.showSceneBadges ? (
        <Fade inSec={0.4} outSec={0.4}>
          <AbsoluteFill
            style={{
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              padding: 80 * r.unit,
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
