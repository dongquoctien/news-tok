import * as React from 'react'
import type { Thumbnail, ThumbnailLayout, ThumbnailTextStyle } from '@news-tok/shared/schema'
import type { LayoutRecipe } from '../topic-router.js'
import { THUMB_WIDTH, THUMB_HEIGHT } from '../safe-zones.js'
import { LayoutDecorator } from './decorators.js'

export type ThumbnailRendererProps = {
  layout: ThumbnailLayout
  edits: Thumbnail['edits']
  background: Thumbnail['background']
  watermark: Thumbnail['watermark']
  recipe: LayoutRecipe
  /**
   * URL prefix for image assets. The renderer wraps the file path
   * directly when no prefix is supplied; Studio + Remotion stage assets
   * differently so this lets callers route paths through the right
   * serving layer.
   */
  resolveImageSrc?: (path: string) => string
}

function defaultResolver(path: string): string {
  // file:// URLs work in both <Img> (Remotion) and browser-with-file:
  // schemes — Studio swaps this for /api/file?path=... at runtime.
  if (/^[a-z]+:\/\//i.test(path)) return path
  return path
}

/**
 * Render a single thumbnail surface at native 1080x1920. Callers wrap
 * this in a scaled <div> (Studio preview) or a Remotion <AbsoluteFill>
 * (renderStill pipeline). All positioning is absolute pixels — there is
 * no responsive scaling here.
 */
export function ThumbnailRenderer({
  layout,
  edits,
  background,
  watermark,
  recipe,
  resolveImageSrc = defaultResolver,
}: ThumbnailRendererProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
        background: '#0b0b0f',
        overflow: 'hidden',
        fontFamily: '"Be Vietnam Pro", Inter, sans-serif',
      }}
    >
      <BackgroundLayer background={background} resolveImageSrc={resolveImageSrc} />

      {/* Solid overlay (e.g. 35% black plate to push back busy photos). */}
      {edits.overlay ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: edits.overlay.color,
            opacity: edits.overlay.opacity,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {/* Radial vignette — darken the corners. */}
      {edits.vignette > 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,${edits.vignette}) 100%)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      <LayoutDecorator layout={layout} recipe={recipe} />

      {edits.eyebrowStyle && edits.eyebrow ? (
        <TextBlock style={edits.eyebrowStyle} text={edits.eyebrow} />
      ) : null}

      <TitleBlock
        style={edits.titleStyle}
        text={edits.title}
        accent={edits.accent}
        accentColor={recipe.palette.primary}
        accentBgColor={accentBgFor(layout, recipe)}
      />

      {edits.chip ? (
        <div
          style={{
            position: 'absolute',
            left: edits.chip.x,
            top: edits.chip.y,
            background: edits.chip.bgColor,
            color: edits.chip.color,
            padding: '10px 22px',
            fontSize: edits.chip.fontSize,
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
            borderRadius: 6,
          }}
        >
          {edits.chip.text}
        </div>
      ) : null}

      {watermark.enabled ? <WatermarkLayer watermark={watermark} /> : null}
    </div>
  )
}

function BackgroundLayer({
  background,
  resolveImageSrc,
}: {
  background: Thumbnail['background']
  resolveImageSrc: (path: string) => string
}) {
  switch (background.kind) {
    case 'random-frame':
      return (
        <img
          src={resolveImageSrc(background.framePath)}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )
    case 'asset-ref':
      return (
        <img
          src={resolveImageSrc(background.asset.path)}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )
    case 'solid':
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: background.color,
          }}
        />
      )
    default: {
      const _exhaustive: never = background
      void _exhaustive
      return null
    }
  }
}

function TextBlock({ style, text }: { style: ThumbnailTextStyle; text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: style.x,
        top: style.y,
        width: style.width,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        backgroundColor: style.bgColor,
        textAlign: style.align,
        fontFamily: style.fontFamily ?? '"Be Vietnam Pro", Inter, sans-serif',
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        textTransform: style.uppercase ? 'uppercase' : 'none',
        padding: style.bgColor ? '8px 16px' : 0,
        boxSizing: 'border-box',
        wordBreak: 'break-word',
        textShadow: style.bgColor ? 'none' : '0 4px 18px rgba(0,0,0,0.55)',
      }}
    >
      {text}
    </div>
  )
}

/**
 * Headline block with optional accent repaint. When `accent` is set,
 * every occurrence of that substring in the headline is wrapped in a
 * span with the accent colour + background plate. Falls back to plain
 * TextBlock when no accent is configured.
 */
function TitleBlock({
  style,
  text,
  accent,
  accentColor,
  accentBgColor,
}: {
  style: ThumbnailTextStyle
  text: string
  accent?: string
  accentColor: string
  accentBgColor: string | undefined
}) {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: style.x,
    top: style.y,
    width: style.width,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    color: style.color,
    textAlign: style.align,
    fontFamily: style.fontFamily ?? '"Be Vietnam Pro", Inter, sans-serif',
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    wordBreak: 'break-word',
    textShadow: '0 4px 18px rgba(0,0,0,0.55)',
  }

  if (!accent || !text.includes(accent)) {
    return <div style={baseStyle}>{text}</div>
  }

  const parts = splitOnAccent(text, accent)
  const accentCss: React.CSSProperties = accentBgColor
    ? {
        background: accentBgColor,
        color: accentColor,
        padding: '4px 14px',
        borderRadius: 8,
        boxDecorationBreak: 'clone' as const,
        WebkitBoxDecorationBreak: 'clone' as const,
        textShadow: 'none',
      }
    : {
        color: accentColor,
      }

  return (
    <div style={baseStyle}>
      {parts.map((p, i) =>
        p.kind === 'accent' ? (
          <span key={i} style={accentCss}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </div>
  )
}

function splitOnAccent(text: string, accent: string): Array<{ kind: 'plain' | 'accent'; text: string }> {
  const out: Array<{ kind: 'plain' | 'accent'; text: string }> = []
  let i = 0
  while (i < text.length) {
    const next = text.indexOf(accent, i)
    if (next === -1) {
      out.push({ kind: 'plain', text: text.slice(i) })
      break
    }
    if (next > i) out.push({ kind: 'plain', text: text.slice(i, next) })
    out.push({ kind: 'accent', text: accent })
    i = next + accent.length
  }
  return out
}

function WatermarkLayer({ watermark }: { watermark: Thumbnail['watermark'] }) {
  const padding = 48
  const positionStyle: React.CSSProperties = (() => {
    switch (watermark.position) {
      case 'bottom-right':
        return { right: padding, bottom: padding }
      case 'bottom-left':
        return { left: padding, bottom: padding }
      case 'top-right':
        return { right: padding, top: padding }
      case 'top-left':
        return { left: padding, top: padding }
      default:
        return { right: padding, bottom: padding }
    }
  })()
  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        color: watermark.color,
        fontSize: watermark.fontSize,
        fontWeight: 700,
        background: watermark.bgColor,
        padding: '8px 16px',
        borderRadius: 6,
        fontFamily: 'Inter, sans-serif',
        letterSpacing: 0.5,
      }}
    >
      {watermark.text}
    </div>
  )
}

function accentBgFor(layout: ThumbnailLayout, recipe: LayoutRecipe): string | undefined {
  switch (layout) {
    case 'news-breaking':
      return recipe.palette.primary
    case 'news-weather':
      return recipe.palette.primary
    case 'entertainment-bomb':
      return recipe.palette.accent
    case 'sports-hype':
      return recipe.palette.primary
    // science / knowledge: just colour change, no plate.
    case 'science-clean':
    case 'knowledge-bookish':
      return undefined
    default: {
      const _exhaustive: never = layout
      void _exhaustive
      return undefined
    }
  }
}
