import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import type { LayoutProps } from './types.js'

/**
 * Default fallback layout — image full-bleed + bottom-fade gradient +
 * TextBlock in owned mode (the user's `align` / `anchor` / `marginPct`
 * place the headline).
 *
 * This is the layout every storyboard saved before PR-A resolves to
 * (their `segment.layoutId` is undefined → `resolveLayout()` returns
 * this). It MUST stay visually identical to the pre-layout-library
 * behaviour or every old project will silently shift.
 *
 * Scene-specific chrome — the title scene's "Newspaper" badge, the
 * key-point scene's "Key point" pill — stays in the scene component,
 * NOT here. FullBleed renders only the universal base (media + text)
 * so the scene wrappers can layer their own affordances on top.
 *
 * KenBurns parameters live here too. Pre-refactor each scene picked
 * its own `from` / `to` / `pan` — we use the KeyPoint values
 * (`from=1.12, to=1.0`) as the default since it's the most common
 * scene in real projects.
 */
export function FullBleed({
  text,
  textStyle,
  fontOverride,
  colorOverride,
  segment,
}: LayoutProps) {
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {media ? (
        <KenBurns src={media.path} from={1.12} to={1.0} panX={-0.05} panY={0.05} />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,11,15,0.0) 0%, rgba(11,11,15,0.55) 70%, rgba(11,11,15,0.95) 100%)',
        }}
      />
      <TextBlock
        text={text}
        style={textStyle}
        mode="owned"
        wordBoundaries={segment.wordBoundaries}
        fontOverride={fontOverride}
        colorOverride={colorOverride}
      />
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
