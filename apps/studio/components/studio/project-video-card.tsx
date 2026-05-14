'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Lazy video preview for the projects list. Mirrors YupClip's pattern:
 *
 *   - Idle state: render the project's pre-extracted thumbnail PNG
 *     plus a big circular Play button overlay in the centre. The
 *     thumbnail is the same one the Downloads → Thumbnail pill ships,
 *     so we only pay for one ffmpeg frame-extract per project.
 *   - Click: swap the poster for an autoplaying <video controls> so
 *     the user can scrub, mute, fullscreen, etc. There is no return
 *     path from the live player back to the poster — once you've
 *     committed to watching, the controls stay.
 *
 * Loading the real <video> on click matters at list scale: 7
 * projects mean 7 native players each demanding metadata + first
 * frame from the mp4. The thumbnail-first version keeps the page
 * snappy until the user actually wants to watch one.
 */
export function ProjectVideoCard({
  projectId,
  videoSrc,
  thumbnailSrc,
  aspect,
  className,
}: {
  projectId: string
  /** Stream URL for the mp4. Usually `/api/asset?path=<abs>`. */
  videoSrc: string | null
  /** URL to a pre-rendered poster — typically the
   *  `/api/projects/<id>/downloads/thumbnail` endpoint. */
  thumbnailSrc: string | null
  aspect: '9:16' | '16:9' | '1:1'
  className?: string
}) {
  // The component starts in poster mode and never returns once the
  // user clicks Play. We considered toggling back on pause but it
  // disrupted ad-hoc scrubbing (every pause to look at a frame would
  // reset the player). Keep it simple.
  const [playing, setPlaying] = useState(false)

  const aspectRatio =
    aspect === '16:9' ? '16 / 9' : aspect === '1:1' ? '1 / 1' : '9 / 16'

  if (!videoSrc) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground',
          className
        )}
        style={{ aspectRatio }}
      >
        Not rendered yet
      </div>
    )
  }

  if (playing) {
    return (
      <video
        // The key forces React to mount a fresh element when we flip
        // out of poster mode — autoplay only fires on initial mount,
        // and we want the click to start playback immediately.
        key={`${projectId}-player`}
        src={videoSrc}
        controls
        autoPlay
        playsInline
        className={cn('block w-full rounded-md bg-black', className)}
        style={{ aspectRatio }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label="Play video"
      className={cn(
        'group relative block w-full overflow-hidden rounded-md bg-black',
        className
      )}
      style={{ aspectRatio }}
    >
      {thumbnailSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailSrc}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-zinc-950" />
      )}

      {/* Slight darken so the Play button reads clearly even on a
          bright thumbnail. */}
      <div className="absolute inset-0 bg-black/20 transition-opacity group-hover:bg-black/30" />

      {/* Big circular Play button, centred. Scale on hover for the
          standard "yes this is clickable" affordance. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition-transform duration-150 group-hover:scale-110">
          <Play
            className="size-7"
            // Filled-look without a separate icon: lucide's Play is an
            // outline triangle by default, so fill it to match the
            // YupClip-style poster button.
            fill="currentColor"
            strokeWidth={0}
            style={{ marginLeft: 3 }}
          />
        </div>
      </div>
    </button>
  )
}
