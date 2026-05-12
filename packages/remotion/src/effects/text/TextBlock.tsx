import type { CSSProperties } from 'react'
import { AbsoluteFill } from 'remotion'
import type { TextStyle, WordBoundary } from '@news-tok/shared/schema'
import { useResponsive } from '../../scenes/sizing.js'
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

type PrimitiveProps = {
  text: string
  style: TextStyle
  wordBoundaries?: WordBoundary[]
}

const PRIMITIVES: Record<TextStyle['enter'], (p: PrimitiveProps) => React.JSX.Element> = {
  none: ({ text, style }) => <FadeInText text={text} style={{ ...style, enterDurationSec: 0 }} />,
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
 * One-stop component every built-in scene uses for headline / body text.
 * Owns layout (anchor / align / margin / plate); delegates motion to a
 * primitive picked by `style.enter`. Scenes still own their background,
 * icon, and any subordinate elements.
 */
export function TextBlock({
  text,
  style,
  wordBoundaries,
}: {
  text: string
  style: TextStyle
  wordBoundaries?: WordBoundary[]
}) {
  const r = useResponsive()
  const Primitive = PRIMITIVES[style.enter] ?? FadeInText
  const plate = plateStyle(style, r.unit * 16)
  const wrap = (
    <Primitive text={text} style={style} wordBoundaries={wordBoundaries} />
  )
  return (
    <AbsoluteFill style={{ display: 'flex', ...anchorStyle(style) }}>
      {plate ? <div style={plate}>{wrap}</div> : wrap}
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
}
