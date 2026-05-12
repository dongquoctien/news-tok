'use client'

import { useState } from 'react'
import { Film, ImageOff } from 'lucide-react'

export type ThumbCellProps = {
  projectId: string
  variantId: string
  /** Whether an `output-<variantId>.mp4` actually exists on disk. */
  rendered: boolean
}

/**
 * Tiny thumbnail tile shown on the project list card, one per variant.
 *
 * On rendered variants it lazily loads /api/projects/[id]/thumb?variant=<vid>
 * which extracts a JPEG first frame via ffmpeg the first time it is hit,
 * then serves the cached file. The `onError` handler degrades to a film
 * icon if the API ever fails (e.g. ffmpeg binary missing on a strange
 * platform), so the project list keeps rendering.
 *
 * Unrendered variants show a dashed placeholder so the user knows that
 * slot exists but has not been generated yet.
 */
export function ThumbCell({ projectId, variantId, rendered }: ThumbCellProps) {
  const [failed, setFailed] = useState(false)
  if (!rendered) {
    return (
      <div
        className="flex h-14 w-12 items-center justify-center rounded border border-dashed border-border/60 text-[10px] text-muted-foreground"
        title={`Variant ${variantId} not rendered yet`}
      >
        {variantId}
      </div>
    )
  }
  return (
    <div className="relative h-14 w-12 overflow-hidden rounded border border-emerald-500/40 bg-secondary/40">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center text-emerald-300">
          <ImageOff className="size-4" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/projects/${projectId}/thumb?variant=${variantId}`}
          alt={`Variant ${variantId}`}
          loading="lazy"
          className="block h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-emerald-200">
        <Film className="mr-0.5 inline size-2.5 align-text-bottom" />
        {variantId}
      </span>
    </div>
  )
}
