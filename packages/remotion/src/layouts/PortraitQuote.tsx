import { AbsoluteFill, Audio } from 'remotion'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * PortraitQuote layout — a full-bleed portrait of a single person
 * dominates the frame, with the segment text rendered as a large
 * quote (auto-wrapped with smart curly quotes) on a translucent
 * plate against the lower-right corner. A bottom name-tag band
 * carries the person's title + affiliation.
 *
 * Reads as a magazine pull-quote / "person says X" callout. Best
 * for expert interviews, official statements, or witness testimony
 * where the source's identity matters as much as the words.
 *
 * Slot mapping:
 *   - media (required) — full-bleed portrait, slow KenBurns push-in.
 *   - text (required) — the quote itself. Layout wraps it with
 *     curly quotes; user TextStyle still drives font + colour.
 *   - eyebrow (optional) — small badge top-right (e.g. "CHUYÊN GIA
 *     PHÁP LUẬT"). Hard-styled.
 *   - fileId (optional) — name + affiliation in the bottom band,
 *     e.g. "LUẬT SƯ NGUYỄN THỊ MAI · SÀI GÒN". Hard-styled.
 *   - chips not rendered.
 */
export function PortraitQuote({
  text,
  eyebrow,
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
      {/* Portrait fills the frame. Slow zoom-in so the subject
          gradually leans toward the camera over the segment. */}
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
          from={1.05}
          to={1.12}
          panX={0}
          panY={-0.03}
          edits={segment.backgroundEdits}
        />
      ) : (
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
          }}
        />
      )}

      {/* Right-side gradient so the quote plate doesn't fight the
          portrait. Lighter on the left where the face usually sits. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 35%, rgba(0,0,0,0.65) 75%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* Eyebrow badge top-right with a stylised gold accent — gives
          the layout its "official expert" tone. */}
      {eyebrow ? (
        <div
          style={{
            position: 'absolute',
            top: 56 * r.unit,
            right: 56 * r.unit,
            display: 'flex',
            alignItems: 'center',
            gap: 14 * r.unit,
            padding: `${12 * r.unit}px ${22 * r.unit}px`,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderLeft: '3px solid #fbbf24',
            borderRadius: 4,
          }}
        >
          <span
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 22 * r.font,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#fbbf24',
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </span>
        </div>
      ) : null}

      {/* Quote plate — anchored bottom-right, occupies ~55% of the
          frame width. Big leading curly quote sets the tone. */}
      <div
        style={{
          position: 'absolute',
          right: 56 * r.unit,
          bottom: 160 * r.unit,
          width: '55%',
          maxWidth: '55%',
          padding: 32 * r.unit,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 12,
          borderLeft: '4px solid #fbbf24',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'block',
            position: 'absolute',
            top: -32 * r.unit,
            left: 16 * r.unit,
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 180 * r.font,
            fontWeight: 700,
            lineHeight: 1,
            color: '#fbbf24',
            opacity: 0.85,
          }}
        >
          “
        </span>
        <TextBlock
          text={text}
          style={textStyle}
          mode="slot"
          wordBoundaries={segment.wordBoundaries}
          fontOverride={fontOverride}
          colorOverride={colorOverride}
        />
      </div>

      {/* Name-tag band — bottom of frame, holds fileId (=
          name + affiliation). Hard-styled, gold-on-blue. */}
      {fileId ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 110 * r.unit,
            background:
              'linear-gradient(90deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
            borderTop: '2px solid #fbbf24',
            display: 'flex',
            alignItems: 'center',
            padding: `0 ${56 * r.unit}px`,
            gap: 20 * r.unit,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8 * r.unit,
              height: 36 * r.unit,
              background: '#fbbf24',
            }}
          />
          <span
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 26 * r.font,
              fontWeight: 700,
              letterSpacing: 2,
              color: '#ffffff',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fileId}
          </span>
        </div>
      ) : null}

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
