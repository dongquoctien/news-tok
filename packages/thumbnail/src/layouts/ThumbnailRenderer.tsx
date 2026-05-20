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

      {/* Centered NEWSTOKVN logo plate for the brand cover layout.
          Painted between the decorator radial halo and the eyebrow
          tagline so it reads as the focal element. The logo URL falls
          back to the watermark logoUrl — same image, different size. */}
      {layout === 'newstokvn-cover' && watermark.logoUrl ? (
        <div
          style={{
            position: 'absolute',
            top: 380,
            left: '50%',
            width: 480,
            height: 480,
            transform: 'translateX(-50%)',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.94)',
            boxShadow:
              '0 0 80px rgba(168,85,247,0.65), 0 24px 60px rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={resolveImageSrc(watermark.logoUrl)}
            alt=""
            style={{ width: '86%', height: '86%', objectFit: 'contain' }}
          />
        </div>
      ) : null}

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

      {watermark.enabled ? <WatermarkLayer watermark={watermark} resolveImageSrc={resolveImageSrc} /> : null}
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

function WatermarkLayer({
  watermark,
  resolveImageSrc,
}: {
  watermark: Thumbnail['watermark']
  resolveImageSrc: (path: string) => string
}) {
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
  // Logo variant — show the channel mark next to the handle. Used by
  // newstokvn-* layouts so the cover doubles as a brand stamp. The
  // logo URL is resolved through the caller's image resolver so
  // Remotion + Studio both see the right URL space.
  if (watermark.kind === 'logo' && watermark.logoUrl) {
    return (
      <div
        style={{
          position: 'absolute',
          ...positionStyle,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 18px',
          background: watermark.bgColor,
          borderRadius: 12,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <img
          src={resolveImageSrc(watermark.logoUrl)}
          alt=""
          style={{
            width: watermark.logoSize,
            height: watermark.logoSize,
            objectFit: 'contain',
          }}
        />
        <span
          style={{
            color: watermark.color,
            fontSize: watermark.fontSize,
            fontWeight: 800,
            letterSpacing: 0.5,
          }}
        >
          {watermark.text}
        </span>
      </div>
    )
  }
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
    case 'newstokvn-breaking':
    case 'newstokvn-flash':
      // Yellow zap plate for the accent phrase — pops against deep purple.
      return recipe.palette.accent
    case 'newstokvn-cover':
      // Cover keeps accent as colour-only so the centered headline
      // stays uncluttered.
      return undefined
    default: {
      const _exhaustive: never = layout
      void _exhaustive
      return undefined
    }
  }
}
