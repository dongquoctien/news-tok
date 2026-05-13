import { AbsoluteFill, Img } from 'remotion'
import type { LogoMarker as LogoMarkerSpec } from '@news-tok/shared/schema'
import { fontFor } from '../scenes/fonts.js'

export type LogoMarkerProps = {
  spec: LogoMarkerSpec
  /**
   * URL the renderer has rewritten to live under publicDir / a Studio
   * endpoint. Required for `kind: 'image'`; ignored for `kind: 'text'`.
   */
  imageUrl?: string
  /** Project language — drives the default font for text watermarks. */
  language?: 'vi' | 'en'
}

type Placement = {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  marginPct: number
}

function placementStyle({ position, marginPct }: Placement): React.CSSProperties {
  const margin = `${marginPct}%`
  const base: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
  }
  if (position === 'top-left') return { ...base, top: margin, left: margin }
  if (position === 'top-right') return { ...base, top: margin, right: margin }
  if (position === 'bottom-left') return { ...base, bottom: margin, left: margin }
  return { ...base, bottom: margin, right: margin }
}

/**
 * Project-wide watermark layer. Mount inside the per-segment <Sequence>
 * (after the scene + subtitles) so it can be gated on `appliesTo` —
 * callers pass `false` for body segments when appliesTo='intro-outro-only'.
 *
 * Layout uses % units so the same spec works across 9:16 / 16:9 / 1:1.
 */
export const LogoMarker = ({ spec, imageUrl, language }: LogoMarkerProps) => {
  if (spec.kind === 'none') return null

  if (spec.kind === 'image') {
    if (!imageUrl) return null
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div
          style={{
            ...placementStyle({ position: spec.position, marginPct: spec.marginPct }),
            width: `${spec.sizePct}%`,
            opacity: spec.opacity,
          }}
        >
          <Img
            src={imageUrl}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        </div>
      </AbsoluteFill>
    )
  }

  // kind === 'text'
  const fontFamily = fontFor(language ?? 'en')
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          ...placementStyle({ position: spec.position, marginPct: spec.marginPct }),
          opacity: spec.opacity,
          // sizePct is % of video width; the parent AbsoluteFill spans the
          // full canvas, so vw-style sizing translates to "X% of width".
          fontSize: `${spec.sizePct}vw`,
          fontFamily,
          fontWeight: 600,
          color: spec.color,
          ...(spec.background
            ? {
                background: spec.background.color,
                padding: `${spec.background.paddingPx}px ${spec.background.paddingPx * 1.5}px`,
                borderRadius: `${spec.background.radiusPx}px`,
              }
            : {}),
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '60%',
        }}
      >
        {spec.text}
      </div>
    </AbsoluteFill>
  )
}
