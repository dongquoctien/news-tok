import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * DossierCard layout — the "YupVid case file" look. Media bleeds in
 * desaturated and dark behind, eyebrow + fileId sit top-left like a
 * folder label, headline overlays the middle, chips form a tight grid
 * at the bottom that reads as "evidence tags".
 *
 * Best when the article has hard facts to call out (e.g. "Bị bắt 3
 * năm trước · Truy nã 12 nước · Thiệt hại 1 tỷ USD") — each chip is
 * one fact. Orchestrator should aim for 2-4 chips; more than that
 * crowds the bottom band.
 *
 * Slot mapping:
 *   - media (required) — full-bleed background, desaturated by an
 *     overlay so foreground text reads cleanly.
 *   - eyebrow (recommended, e.g. "CASE FILE") — uppercase label.
 *   - fileId (recommended, e.g. "FILE 07") — monospace tag inline
 *     with the eyebrow.
 *   - chips (recommended, 2-4) — pill grid at the bottom with
 *     backdrop-filter glass treatment.
 *   - text (required) — headline anchored mid-frame via
 *     TextBlock mode='slot'.
 */
export function DossierCard({
  text,
  eyebrow,
  chips,
  fileId,
  textStyle,
  fontOverride,
  colorOverride,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0f' }}>
      {media ? (
        <KenBurns
          src={media.path}
          kind={media.kind}
          durationSec={media.durationSec}
          videoTrim={segment.videoTrim}
          loop={segment.videoLoop}
          muted={segment.videoMuted}
          volume={segment.videoVolume}
          playbackRate={segment.videoPlaybackRate}
          fit={segment.videoFit}
          align={segment.videoAlign}
          from={1.1}
          to={1.0}
          panX={0.02}
          panY={-0.02}
          edits={segment.backgroundEdits}
        />
      ) : (
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(135deg, #1e1b4b 0%, #0b0b0f 100%)',
          }}
        />
      )}
      {/* Desaturate + darken media so chips & text read clean. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(11,11,15,0.55) 0%, rgba(11,11,15,0.4) 50%, rgba(11,11,15,0.85) 100%)',
        }}
      />

      {/* Top: eyebrow + fileId folder label. */}
      {eyebrow || fileId ? (
        <div
          style={{
            position: 'absolute',
            top: 64 * r.unit,
            left: 64 * r.unit,
            display: 'flex',
            alignItems: 'center',
            gap: 16 * r.unit,
            padding: `${10 * r.unit}px ${20 * r.unit}px`,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 8,
          }}
        >
          {eyebrow ? (
            <span
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 22 * r.font,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: '#a5b4fc',
              }}
            >
              {eyebrow}
            </span>
          ) : null}
          {fileId ? (
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 20 * r.font,
                fontWeight: 600,
                letterSpacing: 2,
                color: '#ffffff',
                opacity: 0.85,
              }}
            >
              {fileId}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Headline anchored middle-left. */}
      <div
        style={{
          position: 'absolute',
          left: 64 * r.unit,
          right: 64 * r.unit,
          top: '38%',
          maxWidth: '90%',
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

      {/* Bottom: chip grid */}
      {chips && chips.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 64 * r.unit,
            right: 64 * r.unit,
            bottom: 96 * r.unit,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12 * r.unit,
          }}
        >
          {chips.slice(0, 5).map((chip, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                padding: `${10 * r.unit}px ${20 * r.unit}px`,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 20 * r.font,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#ffffff',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: 6,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
