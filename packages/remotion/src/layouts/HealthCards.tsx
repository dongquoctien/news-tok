import { AbsoluteFill, Audio } from 'remotion'
import { Activity, Droplets, Leaf, Moon, Heart, Pill } from 'lucide-react'
import { KenBurns } from '../effects/KenBurns.js'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * HealthCards layout — clean medical aesthetic for wellness /
 * health-explainer content. Light medical-blue + green pastel palette
 * (deliberately the opposite of BreakingNews red). Media occupies the
 * upper 45% in a softly rounded frame; the headline + a vertical
 * stack of icon cards fill the lower 55%. Best when the body of the
 * piece is "5 signs of X" or "3 steps to Y".
 *
 * Chips are read as the card list — each chip becomes one card.
 * An icon is auto-picked per chip from a small medical set based on
 * keyword match (water / sleep / leaf / heart / pill / activity)
 * so the orchestrator doesn't have to choose icons explicitly.
 *
 * Slot mapping:
 *   - media (required) — boxed upper 45%, soft rounded corners.
 *   - text (required) — headline anchored just below media.
 *   - chips (recommended, 3-5) — list items. Each card auto-selects
 *     an icon based on keyword.
 *   - eyebrow (optional) — top thin "category" bar.
 *   - fileId — unused.
 */
export function HealthCards({
  text,
  eyebrow,
  chips,
  textStyle,
  fontOverride,
  colorOverride,
  segment,
}: LayoutProps) {
  const r = useResponsive()
  const media = segment.visuals.background
  const narration = segment.audio?.narration

  return (
    <AbsoluteFill style={{ backgroundColor: '#f8fafc' }}>
      {/* Light wash background — gradient from white to a near-white
          cyan so the cards have something to sit on without looking
          flat. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, #ffffff 0%, #f0f9ff 50%, #ecfeff 100%)',
        }}
      />

      {/* Top thin category bar. */}
      {eyebrow ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 64 * r.unit,
            background: '#ffffff',
            borderBottom: '1px solid #e0f2fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12 * r.unit,
          }}
        >
          <Heart
            size={24 * r.unit}
            color="#0284c7"
            strokeWidth={2.5}
            aria-hidden
          />
          <span
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 22 * r.font,
              fontWeight: 700,
              letterSpacing: 4,
              color: '#0c4a6e',
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </span>
        </div>
      ) : null}

      {/* Media frame — soft rounded corners, thin cyan border, large
          inset shadow so it feels lifted off the page. */}
      <div
        style={{
          position: 'absolute',
          top: 96 * r.unit,
          left: 56 * r.unit,
          right: 56 * r.unit,
          height: '40%',
          overflow: 'hidden',
          borderRadius: 28,
          border: '2px solid #e0f2fe',
          boxShadow:
            '0 20px 40px rgba(2, 132, 199, 0.12), 0 6px 12px rgba(0, 0, 0, 0.05)',
          background: '#ffffff',
        }}
      >
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
            from={1.02}
            to={1.08}
            panX={0}
            panY={-0.02}
            edits={segment.backgroundEdits}
          />
        ) : (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(135deg, #e0f2fe 0%, #ecfeff 100%)',
            }}
          />
        )}
      </div>

      {/* Headline — navy on cream, anchored below the media. The
          colorOverride from the resolved TextStyle can re-tint this,
          but the layout is opinionated about navy being the default
          health-content tone. */}
      <div
        style={{
          position: 'absolute',
          top: '52%',
          left: 56 * r.unit,
          right: 56 * r.unit,
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

      {/* Vertical stack of icon cards. The first 5 chips become
          cards; each one auto-picks an icon from the medical set
          based on a Vietnamese-friendly keyword match. */}
      {chips && chips.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 56 * r.unit,
            right: 56 * r.unit,
            bottom: 80 * r.unit,
            display: 'flex',
            flexDirection: 'column',
            gap: 12 * r.unit,
          }}
        >
          {chips.slice(0, 5).map((chip, i) => {
            const Icon = pickHealthIcon(chip)
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16 * r.unit,
                  padding: `${14 * r.unit}px ${20 * r.unit}px`,
                  background: '#ffffff',
                  borderRadius: 16,
                  border: '1px solid #e0f2fe',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 48 * r.unit,
                    height: 48 * r.unit,
                    borderRadius: '50%',
                    background:
                      'linear-gradient(135deg, #ecfeff 0%, #e0f2fe 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    size={26 * r.unit}
                    color="#0284c7"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </div>
                <span
                  style={{
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 22 * r.font,
                    fontWeight: 600,
                    color: '#0c4a6e',
                    lineHeight: 1.3,
                  }}
                >
                  {chip}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Footer — light bar with a trust-anchor line. */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 56 * r.unit,
          background: '#ffffff',
          borderTop: '1px solid #e0f2fe',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 16 * r.font,
            fontWeight: 600,
            letterSpacing: 3,
            color: '#64748b',
            textTransform: 'uppercase',
          }}
        >
          Tư vấn chuyên gia
        </span>
      </div>

      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}

/**
 * Tiny keyword router for chip → icon. Hand-tuned for Vietnamese
 * health-content vocab; falls back to a generic activity icon when
 * nothing matches. Pure heuristic; no language-detection lib needed
 * because chips are short and the keywords overlap with English.
 */
function pickHealthIcon(chip: string) {
  const s = chip.toLowerCase()
  if (/(nước|water|hydrat|drink|uống)/.test(s)) return Droplets
  if (/(ngủ|sleep|nghỉ|moon|rest)/.test(s)) return Moon
  if (/(xanh|rau|leaf|cây|plant|green|veget|fruit)/.test(s)) return Leaf
  if (/(tim|heart|huyết|blood|pulse|máu)/.test(s)) return Heart
  if (/(thuốc|pill|med|vitamin|drug)/.test(s)) return Pill
  return Activity
}
