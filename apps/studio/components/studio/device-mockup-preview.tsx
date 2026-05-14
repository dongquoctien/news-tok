'use client'

import type { Aspect } from '@news-tok/shared/schema'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'

export type DeviceMockupPreviewProps = {
  /** Drives both the frame chrome (phone / laptop / square) and the inner aspect ratio. */
  aspect: Aspect
  /** Optional segment background path. Drawn under the content slot
   *  with a dark gradient overlay so light text stays legible. */
  background?: string
  /** Anything that should sit inside the frame on top of the background —
   *  the picker fills this with a styled text preview or a watermark. */
  children: React.ReactNode
  /** Extra width cap, e.g. limit phone mockup to 280px inside a 360px column. */
  maxWidth?: number
  /** Optional small label rendered above the frame. */
  label?: string
  className?: string
}

/**
 * Shared "what the final video looks like" preview the M11 split-pane
 * pickers all render on the right. The chrome is purely cosmetic — the
 * real render comes from Remotion at export time — but matching the
 * project's aspect ratio to a familiar device frame helps users picture
 * how their style will land on screen.
 *
 * Why static frames instead of mounting `<Player>`:
 *   - Player bundles Remotion's webpack on every dialog open; that's
 *     ~3-5s of cold-start the first time, which destroys the
 *     "click around, see updates" feel.
 *   - Pickers (Style / Font / Logo / Builder) update preview content on
 *     hover. Re-rendering a Player on every hover would crater the FPS
 *     and remount audio.
 *   - We only need to show typography + colour + placement + corner
 *     positioning. CSS can do that faithfully; motion is owned by
 *     individual picker preview slots when they need it.
 */
export function DeviceMockupPreview({
  aspect,
  background,
  children,
  maxWidth,
  label,
  className,
}: DeviceMockupPreviewProps) {
  const bgUrl = background ? assetUrl(background) : null
  const innerStyle: React.CSSProperties = {
    aspectRatio: aspectToCss(aspect),
    backgroundImage: bgUrl
      ? `linear-gradient(180deg, rgba(11,11,15,0.18) 0%, rgba(11,11,15,0.55) 60%, rgba(11,11,15,0.85) 100%), url(${bgUrl})`
      : 'linear-gradient(135deg, #15151b 0%, #1d1d25 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
  // Outer wrapper width override — wins over the default frame caps
  // (`max-w-md` for laptop, `max-w-[320px]` for square, `max-w-[260px]`
  // for phone) so callers can shrink the preview to fit a narrower
  // column without forking the chrome.
  const frameStyle: React.CSSProperties | undefined = maxWidth
    ? { maxWidth: `${maxWidth}px` }
    : undefined

  // Three chrome variants. Each wraps the same inner content + style.
  if (aspect === '16:9') {
    return (
      <div className={cn('flex w-full flex-col items-center gap-2', className)}>
        {label ? <PreviewLabel>{label}</PreviewLabel> : null}
        {/* Laptop chrome: thin bezel, base bar, hinge nub. Sized via
            inline width so the parent column can clamp it. */}
        <div className="w-full max-w-md" style={frameStyle}>
          <div className="rounded-t-md border-2 border-b-0 border-zinc-800 bg-zinc-900 p-1.5 dark:border-zinc-700">
            <div
              className="relative overflow-hidden rounded-sm bg-black"
              style={innerStyle}
            >
              <FrameContent>{children}</FrameContent>
            </div>
          </div>
          <div className="mx-auto h-1 w-[55%] rounded-b-md bg-zinc-800 dark:bg-zinc-700" />
          <div className="mx-auto -mt-px h-1.5 w-[78%] rounded-b-lg bg-gradient-to-b from-zinc-700 to-zinc-900 shadow-sm" />
        </div>
      </div>
    )
  }

  if (aspect === '1:1') {
    // Square frame — a generic gallery-style mat. Used rarely (only
    // when the project picks 1:1 aspect) so the chrome is minimal.
    return (
      <div className={cn('flex w-full flex-col items-center gap-2', className)}>
        {label ? <PreviewLabel>{label}</PreviewLabel> : null}
        <div
          className="w-full max-w-[320px] rounded-md border-2 border-zinc-800 bg-zinc-950 p-2 dark:border-zinc-700"
          style={frameStyle}
        >
          <div
            className="relative overflow-hidden rounded-sm bg-black"
            style={innerStyle}
          >
            <FrameContent>{children}</FrameContent>
          </div>
        </div>
      </div>
    )
  }

  // 9:16 — phone mockup. Notch + speaker + side buttons sketched in via
  // pseudo-elements so the silhouette reads as a phone even at small sizes.
  return (
    <div className={cn('flex w-full flex-col items-center gap-2', className)}>
      {label ? <PreviewLabel>{label}</PreviewLabel> : null}
      <div className="relative w-full max-w-[260px]" style={frameStyle}>
        {/* Side buttons */}
        <span className="absolute -left-[3px] top-[15%] h-[8%] w-[3px] rounded-l-sm bg-zinc-700" />
        <span className="absolute -left-[3px] top-[26%] h-[10%] w-[3px] rounded-l-sm bg-zinc-700" />
        <span className="absolute -right-[3px] top-[20%] h-[12%] w-[3px] rounded-r-sm bg-zinc-700" />
        <div className="rounded-[28px] border-[3px] border-zinc-800 bg-zinc-950 p-1.5 shadow-xl dark:border-zinc-700">
          <div
            className="relative overflow-hidden rounded-[20px] bg-black"
            style={innerStyle}
          >
            {/* Notch */}
            <span className="absolute left-1/2 top-2 z-10 h-3 w-[28%] -translate-x-1/2 rounded-full bg-zinc-950" />
            <FrameContent>{children}</FrameContent>
            {/* Home indicator */}
            <span className="absolute bottom-1.5 left-1/2 z-10 h-[3px] w-[28%] -translate-x-1/2 rounded-full bg-white/70" />
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{children}</p>
  )
}

function FrameContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-3">{children}</div>
  )
}

function aspectToCss(aspect: Aspect): string {
  if (aspect === '9:16') return '9 / 16'
  if (aspect === '16:9') return '16 / 9'
  return '1 / 1'
}

/**
 * Pick a sensible left:right split for a split-pane picker based on the
 * project aspect. Portrait projects need more horizontal room for the
 * options list because the preview is narrow; landscape inverts that.
 */
export function splitRatioFor(aspect: Aspect): { left: string; right: string } {
  if (aspect === '16:9') return { left: '3fr', right: '2fr' }
  // 9:16 and 1:1 both get the wider option list.
  return { left: '7fr', right: '3fr' }
}
