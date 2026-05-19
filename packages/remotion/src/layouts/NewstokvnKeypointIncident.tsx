import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointIncident — triple-tier incident card.
 *
 * Inspired by the "Authorities Confirm an Incident, Details Awaited
 * From Officials" thumbnail variants. Three distinct vertical zones,
 * each holding one job — brand identity, evidence photo, written
 * report. Mirrors print-newspaper hierarchy.
 *
 * Composition (top to bottom):
 *   1. Top brand row: small logo top-left + red INCIDENT chip
 *      top-right.
 *   2. Boxed photo in a rounded white-bordered frame, slightly
 *      inset on both sides — reads as evidence pic.
 *   3. Dark navy / purple plate housing:
 *      - Small "Breaking News" chip (red, rounded).
 *      - Bold white headline (2 lines).
 *      - Light grey body 2-3 sentences.
 *      - "Read More" → on left, "Source: …" on right.
 *
 * Slot mapping:
 *   - media (recommended) — boxed evidence photo.
 *   - eyebrow (optional) — red top-right chip text, default
 *     "SỰ CỐ" (incident in VN).
 *   - text (required) — bold white headline in the bottom plate.
 *   - chips (optional, used as body) — concatenated with spaces and
 *     rendered as a body paragraph. Schema caps each chip at 30
 *     chars, so a 2-sentence body would naturally split across
 *     2-3 chips. Falls back to a generic "Đang cập nhật chi tiết"
 *     copy when no chips provided.
 *   - fileId (optional) — source line, default "newstokvn.com".
 */
export function NewstokvnKeypointIncident({
  text,
  eyebrow,
  chips,
  fileId,
  segment,
  brandLogoUrl,
}: LayoutProps) {
  const r = useResponsive()
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const brandIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const photoIn = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 14 },
  })
  const plateIn = interpolate(frame, [18, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const headlineIn = interpolate(frame, [26, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const sourceIn = interpolate(frame, [38, 56], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const incidentLabel = (eyebrow || 'SỰ CỐ').toUpperCase()
  const body =
    chips && chips.length > 0
      ? chips.join(' ')
      : 'Cơ quan chức năng xác nhận sự cố đang được điều tra. Thông tin chi tiết sẽ được cập nhật tiếp.'
  const source = fileId || 'newstokvn.com'

  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(180deg, #2e1065 0%, #1a0533 50%, #0b0314 100%)',
      }}
    >
      {/* Top brand row: logo left, INCIDENT chip right. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 130 * r.unit,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${40 * r.unit}px`,
          opacity: brandIn,
          transform: `translateY(${(1 - brandIn) * -12}px)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 * r.unit }}>
          <div
            style={{
              width: 64 * r.unit,
              height: 64 * r.unit,
              borderRadius: '50%',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
            }}
          >
            <Img
              src={brandLogoUrl || '/public/newstokvn-logo.png'}
              style={{ width: '88%', height: '88%', objectFit: 'contain' }}
            />
          </div>
          <span
            style={{
              fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
              fontSize: 20 * r.font,
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: 3,
              textTransform: 'uppercase',
              lineHeight: 1.1,
            }}
          >
            NEWSTOKVN
            <br />
            <span style={{ fontSize: 14 * r.font, color: '#a5b4fc', letterSpacing: 2 }}>
              STUDIO
            </span>
          </span>
        </div>
        <div
          style={{
            padding: `${10 * r.unit}px ${22 * r.unit}px`,
            background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
            color: '#ffffff',
            borderRadius: 6,
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 22 * r.font,
            fontWeight: 900,
            letterSpacing: 3,
            textTransform: 'uppercase',
            boxShadow: '0 8px 22px rgba(239,68,68,0.55)',
          }}
        >
          {incidentLabel}
        </div>
      </div>

      {/* Boxed photo evidence — inset frame, rounded, white-thin border. */}
      <div
        style={{
          position: 'absolute',
          top: 170 * r.unit,
          left: 56 * r.unit,
          right: 56 * r.unit,
          height: 720 * r.unit,
          overflow: 'hidden',
          borderRadius: 12,
          border: '4px solid rgba(168,85,247,0.55)',
          boxShadow:
            '0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(168,85,247,0.25)',
          backgroundColor: '#0b0314',
          opacity: photoIn,
          transform: `scale(${0.94 + photoIn * 0.06})`,
        }}
      >
        {media ? (
          <KenBurns
            src={media.path}
            from={1.04}
            to={1.10}
            panX={0}
            panY={0.02}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background: 'linear-gradient(135deg, #4c1d95 0%, #1a0533 100%)',
            }}
          />
        )}
      </div>

      {/* Bottom plate — Breaking chip + headline + body + source. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 100 * r.unit,
          padding: `${24 * r.unit}px ${28 * r.unit}px`,
          background:
            'linear-gradient(180deg, rgba(46,16,101,0.96) 0%, rgba(26,5,51,0.98) 100%)',
          borderRadius: 14,
          border: '1px solid rgba(168,85,247,0.4)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
          opacity: plateIn,
          transform: `translateY(${(1 - plateIn) * 18}px)`,
        }}
      >
        {/* Small red Breaking News chip. */}
        <div
          style={{
            display: 'inline-block',
            padding: `${6 * r.unit}px ${14 * r.unit}px`,
            background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
            color: '#ffffff',
            borderRadius: 4,
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 18 * r.font,
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 14 * r.unit,
          }}
        >
          Breaking news
        </div>

        {/* Headline. */}
        <div
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 42 * r.font,
            fontWeight: 900,
            lineHeight: 1.18,
            color: '#ffffff',
            opacity: headlineIn,
            transform: `translateY(${(1 - headlineIn) * 12}px)`,
          }}
        >
          {text}
        </div>

        {/* Body sentences. */}
        <div
          style={{
            marginTop: 14 * r.unit,
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: 22 * r.font,
            fontWeight: 500,
            lineHeight: 1.35,
            color: '#cbd5f5',
            opacity: sourceIn,
          }}
        >
          {body}
        </div>

        {/* Bottom row: Read more left, source right. */}
        <div
          style={{
            marginTop: 18 * r.unit,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: sourceIn,
          }}
        >
          <span
            style={{
              fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
              fontSize: 20 * r.font,
              fontWeight: 800,
              color: '#facc15',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Đọc thêm →
          </span>
          <span
            style={{
              fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
              fontSize: 18 * r.font,
              fontWeight: 600,
              color: '#a5b4fc',
              letterSpacing: 1,
            }}
          >
            Nguồn: {source}
          </span>
        </div>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
