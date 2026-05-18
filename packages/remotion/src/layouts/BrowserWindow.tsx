import { AbsoluteFill, Audio } from 'remotion'
import { TextBlock } from '../effects/text/TextBlock.js'
import { useResponsive } from '../scenes/sizing.js'
import type { LayoutProps } from './types.js'

/**
 * BrowserWindow layout — mac-style window chrome (3 traffic-light dots
 * + URL bar) framing the media, with headline pinned underneath the
 * window. Mirrors YupVid's JARVIS look (mac window with the orange
 * Siri-style emblem inside).
 *
 * Slot mapping:
 *   - media (recommended) — fills the window viewport; defaults to a
 *     dark gradient when absent so the chrome still looks correct.
 *   - eyebrow (optional) — small uppercase label above the headline.
 *   - fileId (optional) — monospace label shown in the URL bar, e.g.
 *     "JARVIS.APP" or "GEMINI 3.1".
 *   - text (required) — headline below the window via TextBlock slot.
 *   - chips: ignored. The single fileId in the URL bar is the
 *     evidence chip equivalent for this layout.
 */
export function BrowserWindow({
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
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 50% 30%, #1f1f2a 0%, #0b0b0f 70%)',
        }}
      />

      {/* Window frame: titlebar + content. Sits ~12% padded. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          top: 14 * r.unit + 80 * r.unit,
          bottom: '36%',
          borderRadius: 16 * r.unit,
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
          background: '#0b0b0f',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Titlebar — mac traffic lights + URL field. */}
        <div
          style={{
            height: 48 * r.unit,
            display: 'flex',
            alignItems: 'center',
            gap: 12 * r.unit,
            padding: `0 ${20 * r.unit}px`,
            background: '#15151b',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 14 * r.unit,
              height: 14 * r.unit,
              borderRadius: 999,
              background: '#ef4444',
            }}
          />
          <span
            style={{
              display: 'inline-block',
              width: 14 * r.unit,
              height: 14 * r.unit,
              borderRadius: 999,
              background: '#f59e0b',
            }}
          />
          <span
            style={{
              display: 'inline-block',
              width: 14 * r.unit,
              height: 14 * r.unit,
              borderRadius: 999,
              background: '#10b981',
            }}
          />
          <div
            style={{
              flex: 1,
              marginLeft: 16 * r.unit,
              height: 28 * r.unit,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 18 * r.font,
              color: '#a5b4fc',
              letterSpacing: 2,
            }}
          >
            {fileId ?? 'app.local'}
          </div>
        </div>

        {/* Window content area = media. */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {media ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.path}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(circle at 50% 50%, #1e1b4b 0%, #0b0b0f 80%)',
              }}
            />
          )}
        </div>
      </div>

      {/* Headline beneath the window. */}
      <div
        style={{
          position: 'absolute',
          left: 56 * r.unit,
          right: 56 * r.unit,
          bottom: 96 * r.unit,
        }}
      >
        {eyebrow ? (
          <div
            style={{
              marginBottom: 12 * r.unit,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 22 * r.font,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#a5b4fc',
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <TextBlock
          text={text}
          style={textStyle}
          mode="slot"
          wordBoundaries={segment.wordBoundaries}
          fontOverride={fontOverride}
          colorOverride={colorOverride}
          highlightStyle={segment.highlightStyle}
        />
      </div>
      {narration ? <Audio src={narration.path} /> : null}
    </AbsoluteFill>
  )
}
