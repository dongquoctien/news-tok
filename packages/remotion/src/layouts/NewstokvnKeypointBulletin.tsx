import { AbsoluteFill, Audio, Img } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * NewstokvnKeypointBulletin — "TV bulletin" key-point layout.
 *
 * Composition:
 *   - Top header strip: small NEWSTOKVN logo + bold "NEWSTOKVN · TIN
 *     NÓNG" channel mark on a flat purple plate.
 *   - Media: framed box in the upper 50% with KenBurns push-in.
 *   - Headline: bold white text on a purple-tinted plate just below
 *     the media frame. TextBlock in slot mode so user text style /
 *     font / colour overrides still apply.
 *   - Bottom footer strip: thin purple bar with a small category
 *     pill (eyebrow) and a "@newstokvn" handle on the right.
 *
 * Slot mapping:
 *   - media (required) — framed in the upper half. Without media the
 *     frame draws a brand-gradient fallback so the layout still
 *     reads as "channel bulletin" rather than a broken thumb.
 *   - text (required) — headline; user TextStyle applies.
 *   - eyebrow (optional) — small category pill in the footer. Default
 *     "TIN NÓNG".
 *   - fileId (optional) — small ID badge above the headline plate
 *     (e.g. "TIN SỐ 02"). Skipped when undefined.
 *   - chips — not used (use HealthCards or DossierCard for chip grids).
 */
export function NewstokvnKeypointBulletin({
  text,
  eyebrow,
  fileId,
  textStyle,
  fontOverride,
  colorOverride,
  segment,
  brandLogoUrl,
}: LayoutProps) {
  const r = useResponsive()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  const category = (eyebrow || 'TIN NÓNG').toUpperCase()

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a0a3a' }}>
      {/* Backdrop wash so the framed media doesn't float on pure
          black; matches the brand purple family. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, #2e1065 0%, #1a0533 60%, #0b0314 100%)',
        }}
      />

      {/* Top header strip — channel mark + small logo. Pinned all
          the way to the top edge like a broadcast lower-third gone
          rogue to the top. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: r.square ? '8.5%' : 110 * r.unit,
          background: 'linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 14 * r.unit,
          padding: `0 ${36 * r.unit}px`,
          boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: 70 * r.unit,
            height: 70 * r.unit,
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
            fontSize: r.safeFont(32),
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: 3,
            textTransform: 'uppercase',
            textShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          NEWSTOKVN · {category}
        </span>
      </div>

      {/* Media frame — boxed inset in the upper-middle. Bordered so
          it reads as "broadcast cutout" rather than full-bleed. */}
      <div
        style={{
          position: 'absolute',
          top: r.square ? '12%' : 160 * r.unit,
          left: '5%',
          right: '5%',
          height: r.square ? '40%' : '46%',
          overflow: 'hidden',
          borderRadius: 12,
          border: '3px solid rgba(168,85,247,0.6)',
          boxShadow:
            '0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(168,85,247,0.25)',
          backgroundColor: '#0b0314',
        }}
      >
        {media ? (
          <KenBurns
            src={media.path}
            from={1.05}
            to={1.14}
            panX={0}
            panY={0.02}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(135deg, #4c1d95 0%, #1a0533 100%)',
            }}
          />
        )}
        {/* Small fileId badge inside the frame top-right — only
            shown when fileId is explicitly set. */}
        {fileId ? (
          <div
            style={{
              position: 'absolute',
              top: 14 * r.unit,
              right: 14 * r.unit,
              padding: `${6 * r.unit}px ${14 * r.unit}px`,
              background: 'rgba(11,3,20,0.78)',
              color: '#ede9fe',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: r.safeFont(18),
              fontWeight: 700,
              letterSpacing: 2,
              borderRadius: 4,
              border: '1px solid rgba(168,85,247,0.45)',
            }}
          >
            {fileId.toUpperCase()}
          </div>
        ) : null}
      </div>

      {/* Headline plate — purple-tinted band below the media. User
          TextStyle still drives typography via TextBlock(slot). */}
      <div
        style={{
          position: 'absolute',
          left: '5%',
          right: '5%',
          top: r.square ? '56%' : '66%',
          maxWidth: '90%',
          padding: `${22 * r.unit}px ${28 * r.unit}px`,
          background:
            'linear-gradient(180deg, rgba(76,29,149,0.85) 0%, rgba(46,16,101,0.92) 100%)',
          borderRadius: 10,
          border: '1px solid rgba(168,85,247,0.35)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        }}
      >
        <TextBlock
          text={text}
          style={textStyle}
          mode="slot"
          wordBoundaries={segment.wordBoundaries}
          fontOverride={fontOverride}
          colorOverride={colorOverride}
        />
      </div>

      {/* Bottom footer — thin purple bar with category pill +
          handle. Mirrors the bottom nav strip on the channel banner. */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: r.square ? '6%' : 72 * r.unit,
          background: 'linear-gradient(180deg, #5b21b6 0%, #2e1065 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${36 * r.unit}px`,
          borderTop: '2px solid rgba(168,85,247,0.45)',
        }}
      >
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: r.safeFont(22),
            fontWeight: 800,
            color: '#facc15',
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {category}
        </span>
        <span
          style={{
            fontFamily: 'Be Vietnam Pro, Inter, system-ui, sans-serif',
            fontSize: r.safeFont(22),
            fontWeight: 700,
            color: '#ede9fe',
            letterSpacing: 1,
            opacity: 0.9,
          }}
        >
          @newstokvn
        </span>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
