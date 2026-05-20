import * as React from 'react'
import type { LayoutRecipe } from '../topic-router.js'
import type { ThumbnailLayout } from '@news-tok/shared/schema'
import { THUMB_WIDTH, THUMB_HEIGHT } from '../safe-zones.js'

/**
 * Layout-specific decoration painted on TOP of the photo but UNDER the
 * text blocks. This is where each layout's brand identity lives:
 * - news-breaking: heavy bottom gradient + side stripe
 * - news-weather: red category band + top-left channel chip
 * - entertainment-bomb: bottom gradient + corner sparkle
 * - science-clean: full-bleed deep-blue gradient (replaces photo when bg = solid)
 * - knowledge-bookish: cream paper texture + serif accent bar
 * - sports-hype: diagonal yellow stripe + bottom gradient
 *
 * Decorators take a `recipe` so they can theme themselves to the topic
 * palette while keeping the brand silhouette consistent.
 */

export function LayoutDecorator({
  layout,
  recipe,
}: {
  layout: ThumbnailLayout
  recipe: LayoutRecipe
}) {
  switch (layout) {
    case 'news-breaking':
      return <NewsBreakingDeco recipe={recipe} />
    case 'news-weather':
      return <NewsWeatherDeco recipe={recipe} />
    case 'entertainment-bomb':
      return <EntertainmentBombDeco recipe={recipe} />
    case 'science-clean':
      return <ScienceCleanDeco recipe={recipe} />
    case 'knowledge-bookish':
      return <KnowledgeBookishDeco recipe={recipe} />
    case 'sports-hype':
      return <SportsHypeDeco recipe={recipe} />
    default: {
      const _exhaustive: never = layout
      void _exhaustive
      return null
    }
  }
}

function NewsBreakingDeco({ recipe }: { recipe: LayoutRecipe }) {
  return (
    <>
      {/* Bottom gradient — push back busy photo so white headline reads. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.8) 80%, rgba(0,0,0,0.95) 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* Side stripe — vertical bar in the primary colour anchoring the
          left edge of the headline. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 850,
          width: 14,
          height: 480,
          background: recipe.palette.primary,
        }}
      />
    </>
  )
}

function NewsWeatherDeco({ recipe }: { recipe: LayoutRecipe }) {
  return (
    <>
      {/* Bottom gradient. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.85) 90%)',
          pointerEvents: 'none',
        }}
      />
      {/* Top-left channel tag plate (e.g. "VTV24"). The text actually
          lives in the eyebrow + a smaller chip; this is just the strap
          behind it. */}
      <div
        style={{
          position: 'absolute',
          top: 250,
          left: 56,
          width: 220,
          height: 64,
          background: '#FFFFFF',
          borderLeft: `12px solid ${recipe.palette.primary}`,
        }}
      />
    </>
  )
}

function EntertainmentBombDeco({ recipe }: { recipe: LayoutRecipe }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.85) 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* Diagonal corner accent — yellow flash in the top-right. */}
      <div
        style={{
          position: 'absolute',
          top: 250,
          right: -120,
          width: 380,
          height: 120,
          background: recipe.palette.primary,
          transform: 'rotate(35deg)',
          transformOrigin: 'top right',
          opacity: 0.92,
        }}
      />
    </>
  )
}

function ScienceCleanDeco({ recipe }: { recipe: LayoutRecipe }) {
  // Full-bleed gradient replaces the photo for science layout — works
  // even when no background frame has been extracted. The image (if
  // present) blends on top via background-blend-mode at the surface
  // level, but the gradient is the default canvas.
  const from = recipe.palette.primary
  const to = recipe.palette.secondary ?? recipe.palette.ink
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)`,
          opacity: 0.85,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />
      {/* Geometric accent — concentric circles top-right for science feel. */}
      <svg
        width={420}
        height={420}
        viewBox="0 0 420 420"
        style={{ position: 'absolute', top: 260, right: 40, opacity: 0.32 }}
      >
        <circle cx={210} cy={210} r={200} fill="none" stroke={recipe.palette.accent} strokeWidth={3} />
        <circle cx={210} cy={210} r={140} fill="none" stroke={recipe.palette.accent} strokeWidth={2} />
        <circle cx={210} cy={210} r={80} fill="none" stroke={recipe.palette.accent} strokeWidth={2} />
      </svg>
    </>
  )
}

function KnowledgeBookishDeco({ recipe }: { recipe: LayoutRecipe }) {
  // Cream paper canvas — overrides any photo with a soft warm wash so
  // the layout reads as printed page.
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: recipe.palette.accent,
          opacity: 0.94,
          pointerEvents: 'none',
        }}
      />
      {/* Top + bottom hairline rules — subtle editorial feel. */}
      <div
        style={{
          position: 'absolute',
          top: 240,
          left: 56,
          right: 56,
          height: 2,
          background: recipe.palette.ink,
          opacity: 0.85,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 240,
          left: 56,
          right: 56,
          height: 2,
          background: recipe.palette.ink,
          opacity: 0.85,
        }}
      />
      {/* Accent vertical bar — secondary colour, sits left of headline. */}
      {recipe.palette.secondary ? (
        <div
          style={{
            position: 'absolute',
            top: 280,
            left: 0,
            width: 12,
            height: 720,
            background: recipe.palette.secondary,
          }}
        />
      ) : null}
    </>
  )
}

function SportsHypeDeco({ recipe }: { recipe: LayoutRecipe }) {
  return (
    <>
      {/* Diagonal yellow stripe — the brand silhouette. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: -200,
          width: THUMB_WIDTH + 400,
          height: 220,
          background: recipe.palette.primary,
          transform: 'rotate(-8deg)',
          transformOrigin: 'top left',
          opacity: 0.94,
        }}
      />
      {/* Heavy bottom darken so big white uppercase text wins. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.85) 90%)',
          pointerEvents: 'none',
        }}
      />
    </>
  )
}

export { THUMB_WIDTH, THUMB_HEIGHT }
