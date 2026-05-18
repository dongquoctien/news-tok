import type { CSSProperties } from 'react'
import { AbsoluteFill } from 'remotion'
import type { ColorOverride, HighlightStyle, TextStyle, WordBoundary } from '@news-tok/shared/schema'
import { useResponsive } from '../../scenes/sizing.js'
import { parseHighlightMarkers } from './parse-highlight.js'
import { FadeInText } from './FadeInText.js'
import { SlideUpText } from './SlideUpText.js'
import { SlideDownText } from './SlideDownText.js'
import { ScaleInText } from './ScaleInText.js'
import { TypewriterText } from './TypewriterText.js'
import { WordPopText } from './WordPopText.js'
import { WordHighlightText } from './WordHighlightText.js'
import { GradientWipeText } from './GradientWipeText.js'
import { SlotMachineText } from './SlotMachineText.js'
import { BlurRevealText } from './BlurRevealText.js'
import { GlitchText } from './GlitchText.js'
import { WordReveal3dText } from './WordReveal3dText.js'
import { WaveBounceText } from './WaveBounceText.js'
import { MaskWipeText } from './MaskWipeText.js'
import { KaraokeText } from './KaraokeText.js'
import { LetterStaggerText } from './LetterStaggerText.js'
import {
  BounceInText,
  FlipInXText,
  JelloText,
  LightSpeedInText,
  RollInText,
  RubberBandText,
  TadaText,
} from './AnimateCssText.js'

type PrimitiveProps = {
  text: string
  parts?: ReturnType<typeof parseHighlightMarkers>['runs']
  wordHighlightMask?: boolean[]
  highlightStyle?: HighlightStyle
  style: TextStyle
  wordBoundaries?: WordBoundary[]
  fontOverride?: string
  colorOverride?: ColorOverride
}

const PRIMITIVES: Record<TextStyle['enter'], (p: PrimitiveProps) => React.JSX.Element> = {
  none: ({ text, parts, wordHighlightMask, highlightStyle, style, fontOverride, colorOverride }) => (
    <FadeInText
      text={text}
      parts={parts}
      wordHighlightMask={wordHighlightMask}
      highlightStyle={highlightStyle}
      style={{ ...style, enterDurationSec: 0 }}
      fontOverride={fontOverride}
      colorOverride={colorOverride}
    />
  ),
  fade: FadeInText,
  slideUp: SlideUpText,
  slideDown: SlideDownText,
  scaleIn: ScaleInText,
  typewriter: TypewriterText,
  wordPop: WordPopText,
  wordHighlight: WordHighlightText,
  gradientWipe: GradientWipeText,
  slotMachine: SlotMachineText,
  blurReveal: BlurRevealText,
  glitch: GlitchText,
  wordReveal3d: WordReveal3dText,
  waveBounce: WaveBounceText,
  maskWipe: MaskWipeText,
  karaoke: KaraokeText,
  letterStagger: LetterStaggerText,
  bounceIn: BounceInText,
  rubberBand: RubberBandText,
  flipInX: FlipInXText,
  lightSpeedIn: LightSpeedInText,
  rollIn: RollInText,
  tada: TadaText,
  jello: JelloText,
}

function plateStyle(style: TextStyle, padBasePx: number): CSSProperties | null {
  const bg = style.background
  if (bg.kind === 'none') return null
  const padding = (bg.paddingPct / 100) * padBasePx * 4
  const radius = bg.radiusPx
  if (bg.kind === 'solid') {
    return {
      background: bg.color,
      opacity: bg.opacity,
      padding,
      borderRadius: radius,
      display: 'inline-block',
    }
  }
  return {
    background: `linear-gradient(${bg.angleDeg}deg, ${bg.from}, ${bg.to})`,
    padding,
    borderRadius: radius,
    display: 'inline-block',
  }
}

function anchorStyle(style: TextStyle): CSSProperties {
  const margin = `${style.marginPct}%`
  const justify =
    style.anchor === 'top'
      ? 'flex-start'
      : style.anchor === 'middle'
        ? 'center'
        : 'flex-end'
  const align =
    style.align === 'left' ? 'flex-start' : style.align === 'right' ? 'flex-end' : 'center'
  return {
    justifyContent: justify,
    alignItems: align,
    padding: margin,
    pointerEvents: 'none',
  }
}

/**
 * One-stop component for headline / body text.
 *
 * Mode 'owned' (default): wraps the text in an AbsoluteFill + flex
 * container and honours the style's `anchor` / `align` / `marginPct`.
 * Used by built-in scenes and the FullBleed layout (current pre-layout-
 * library behaviour).
 *
 * Mode 'slot': skips the AbsoluteFill + anchorStyle wrap. The caller
 * (a custom layout) has already placed the text container, so we only
 * need to render plate + primitive. All other style fields still apply
 * — typography, decorators, motion, fontOverride, colorOverride — just
 * not the placement triplet.
 *
 * `fontOverride` is computed once by the composition (variant → segment
 * → style chain) and passed through to every primitive so they don't
 * all repeat the lookup.
 */
export function TextBlock({
  text,
  style,
  mode = 'owned',
  wordBoundaries,
  fontOverride,
  colorOverride,
  highlightStyle,
}: {
  text: string
  style: TextStyle
  /** 'owned' (default) wraps in AbsoluteFill + flex; 'slot' renders
   *  inline so the caller controls placement. */
  mode?: 'owned' | 'slot'
  wordBoundaries?: WordBoundary[]
  fontOverride?: string
  colorOverride?: ColorOverride
  /**
   * When set together with `**...**` markers in `text`, every match is
   * repainted by the renderer using this style. When absent (or text
   * has no markers), the headline renders verbatim — primitives skip
   * the highlight branch.
   */
  highlightStyle?: HighlightStyle
}) {
  const r = useResponsive()
  const Primitive = PRIMITIVES[style.enter] ?? FadeInText
  const plate = plateStyle(style, r.unit * 16)
  // Parse `**...**` markers once and feed the result to the primitive.
  // Primitives that need a single string use `parsed.strippedText` (via
  // the `text` prop); whole-string primitives read `parsed.runs`; per-
  // word primitives read `parsed.wordMask`.
  const parsed = parseHighlightMarkers(text)
  const wrap = (
    <Primitive
      text={parsed.strippedText}
      parts={parsed.hasHighlight ? parsed.runs : undefined}
      wordHighlightMask={parsed.hasHighlight ? parsed.wordMask : undefined}
      highlightStyle={parsed.hasHighlight ? highlightStyle : undefined}
      style={style}
      wordBoundaries={wordBoundaries}
      fontOverride={fontOverride}
      colorOverride={colorOverride}
    />
  )
  const inner = plate ? <div style={plate}>{wrap}</div> : wrap
  if (mode === 'slot') return inner
  return (
    <AbsoluteFill style={{ display: 'flex', ...anchorStyle(style) }}>
      {inner}
    </AbsoluteFill>
  )
}

/** Re-exports so callers can pick a primitive directly when needed. */
export {
  FadeInText,
  SlideUpText,
  SlideDownText,
  ScaleInText,
  TypewriterText,
  WordPopText,
  WordHighlightText,
  GradientWipeText,
  SlotMachineText,
  BlurRevealText,
  GlitchText,
  WordReveal3dText,
  WaveBounceText,
  MaskWipeText,
  KaraokeText,
  LetterStaggerText,
  BounceInText,
  RubberBandText,
  FlipInXText,
  LightSpeedInText,
  RollInText,
  TadaText,
  JelloText,
}
