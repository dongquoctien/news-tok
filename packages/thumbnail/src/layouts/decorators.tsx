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
 * - newstokvn-breaking: deep purple radial + red BREAKING/24/7 badge + yellow zap
 * - newstokvn-flash: purple radial + twin zap bolts + diagonal speed lines
 * - newstokvn-cover: purple radial + soft halo (logo gets painted by renderer)
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
    case 'newstokvn-breaking':
      return <NewstokvnBreakingDeco recipe={recipe} />
    case 'newstokvn-flash':
      return <NewstokvnFlashDeco recipe={recipe} />
    case 'newstokvn-cover':
      return <NewstokvnCoverDeco recipe={recipe} />
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

// ----- NEWSTOKVN brand-locked decorators --------------------------------
//
// All three share the brand palette (deep purple + yellow zap + red
// breaking badge) so they read as one channel. Use NEWSTOKVN_RECIPE
// (topic-router) so palette overrides from topic classification get
// ignored when the user opts into a brand layout.

function NewstokvnBreakingDeco({ recipe }: { recipe: LayoutRecipe }) {
  return (
    <>
      {/* Deep purple radial wash — the brand bg. Sits on top of the
          photo so a busy photo background still feels "channel-like".
          We use a high-opacity radial WITHOUT mixBlendMode because
          Remotion's Chromium honours blend modes only when the parent
          establishes an isolated stacking context, which AbsoluteFill
          doesn't by default. A near-opaque radial reads as the brand
          colour while still letting the photo poke through the
          transparent centre. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            `radial-gradient(circle at 50% 38%, ${recipe.palette.primary}DD 0%, ${recipe.palette.ink}F5 65%, #0b0314FA 100%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Soft top glow — sells the "spotlit" feel above the headline. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 28%, rgba(168,85,247,0.30) 0%, transparent 55%)',
          pointerEvents: 'none',
        }}
      />
      {/* Diagonal speed-streaks — purely decorative, repeating linear
          gradient keeps the bundle small vs an animated svg. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.08,
          background:
            'repeating-linear-gradient(105deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 80px)',
          pointerEvents: 'none',
        }}
      />
      {/* Red BREAKING / 24/7 stacked badge top-right. Coordinates kept
          inside the universal safe zone so the badge survives every
          platform's UI crop. */}
      <div
        style={{
          position: 'absolute',
          top: 280,
          right: 56,
          background: recipe.palette.secondary ?? '#DC2626',
          color: '#FFFFFF',
          padding: '14px 28px',
          fontSize: 44,
          fontWeight: 900,
          fontFamily: 'Be Vietnam Pro, Inter, sans-serif',
          letterSpacing: 2,
          lineHeight: 1,
          borderRadius: 4,
          boxShadow: '0 6px 24px rgba(220,38,38,0.55)',
        }}
      >
        BREAKING
      </div>
      <div
        style={{
          position: 'absolute',
          top: 360,
          right: 56,
          background: '#FFFFFF',
          color: recipe.palette.secondary ?? '#DC2626',
          padding: '6px 14px',
          fontSize: 28,
          fontWeight: 900,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 4,
          lineHeight: 1,
          borderRadius: 4,
        }}
      >
        24/7
      </div>
      {/* Yellow lightning bolt drawn as SVG so the renderer doesn't
          need a font with the ⚡ glyph. Positioned to flank the
          headline's left edge. */}
      <svg
        width={120}
        height={180}
        viewBox="0 0 100 150"
        style={{ position: 'absolute', top: 1050, left: -10, filter: 'drop-shadow(0 6px 18px rgba(250,204,21,0.55))' }}
      >
        <polygon
          points="60,0 10,80 45,80 30,150 90,55 55,55 75,0"
          fill={recipe.palette.accent}
          stroke="#fef08a"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
    </>
  )
}

function NewstokvnFlashDeco({ recipe }: { recipe: LayoutRecipe }) {
  return (
    <>
      {/* Lighter radial than breaking — more "live broadcast" vibe.
          Uses opaque alpha-channel mix instead of mixBlendMode so the
          purple wash reads predictably under Remotion's renderer. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            `radial-gradient(circle at 50% 50%, ${recipe.palette.primary}E0 0%, ${recipe.palette.ink}F5 60%, #0b0314FA 100%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Diagonal speed streaks — more visible than the breaking variant
          so it feels "fast" / "alert". */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.14,
          background:
            'repeating-linear-gradient(115deg, rgba(255,255,255,0.7) 0 2px, transparent 2px 70px)',
          pointerEvents: 'none',
        }}
      />
      {/* Twin zap bolts flanking the headline — left tilted forward,
          right tilted backward to read as motion. */}
      <svg
        width={110}
        height={160}
        viewBox="0 0 100 150"
        style={{ position: 'absolute', top: 1020, left: 30, transform: 'rotate(-12deg)', filter: 'drop-shadow(0 6px 18px rgba(250,204,21,0.55))' }}
      >
        <polygon
          points="60,0 10,80 45,80 30,150 90,55 55,55 75,0"
          fill={recipe.palette.accent}
          stroke="#fef08a"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
      <svg
        width={110}
        height={160}
        viewBox="0 0 100 150"
        style={{ position: 'absolute', top: 1020, right: 30, transform: 'rotate(12deg) scaleX(-1)', filter: 'drop-shadow(0 6px 18px rgba(250,204,21,0.55))' }}
      >
        <polygon
          points="60,0 10,80 45,80 30,150 90,55 55,55 75,0"
          fill={recipe.palette.accent}
          stroke="#fef08a"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
    </>
  )
}

function NewstokvnCoverDeco({ recipe }: { recipe: LayoutRecipe }) {
  return (
    <>
      {/* Brand radial — same hue as IntroCover for channel recognition.
          Mostly opaque so the logo + tagline read as the focal element. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            `radial-gradient(circle at 50% 38%, ${recipe.palette.primary}F0 0%, ${recipe.palette.ink}FA 55%, #0b0314 100%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Soft halo above the centre — the renderer paints the logo on
          top of this halo (positioned via edits coordinates). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 38%, rgba(168,85,247,0.45) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />
      {/* Subtle speed lines — quieter than flash so the logo + tagline
          stay the focal point. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.06,
          background:
            'repeating-linear-gradient(105deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 100px)',
          pointerEvents: 'none',
        }}
      />
    </>
  )
}

export { THUMB_WIDTH, THUMB_HEIGHT }
