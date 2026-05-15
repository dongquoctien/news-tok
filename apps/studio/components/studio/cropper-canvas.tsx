'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type CropRect = {
  xPct: number
  yPct: number
  widthPct: number
  heightPct: number
}

/**
 * Cropper-style image editor: shows the source image at object-contain
 * inside a fixed-size frame, then overlays a movable + resizable crop
 * rectangle. Coordinates round-trip as percentages of the source image
 * (0..100), so the parent can store one rect that survives any frame
 * size and matches the renderer's coordinate system 1:1.
 *
 * Interaction model:
 *   - Drag the crop body to pan.
 *   - Drag any of 8 handles (4 corners + 4 edge midpoints) to resize.
 *   - When `aspectLock` is set, resizing snaps to that ratio so the
 *     user can't accidentally break a 9:16 / 1:1 / 16:9 preset by
 *     dragging an edge.
 *   - Everything is clamped to [0..100] on each axis.
 */
export function CropperCanvas({
  imageUrl,
  rect,
  onChange,
  aspectLock,
  className,
}: {
  imageUrl: string | null
  rect: CropRect
  onChange: (next: CropRect) => void
  /**
   * When defined, resizing maintains this ratio (width/height in source
   * image space — but since the crop's coordinates are in source-image
   * percentages, callers should pass the desired *visual* ratio
   * accounting for the source aspect; see the dialog for how it
   * derives this). When undefined, free resize.
   */
  aspectLock?: number
  className?: string
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  // The actual rect the <img> occupies inside the frame after
  // object-contain letterboxing. Drag math needs this so a pixel
  // delta on the mouse can be converted to a percent delta in
  // image space.
  const [imgBox, setImgBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Keep a live ref to onChange so the pointermove handler doesn't
  // need to re-bind every render.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Recompute the rendered image box whenever the frame resizes or
  // the natural image size lands. object-contain letterboxes — the
  // image hugs whichever dimension is smaller relative to the frame.
  useLayoutEffect(() => {
    const update = () => {
      const frame = frameRef.current
      const nat = imgNatural
      if (!frame || !nat) return
      const fw = frame.clientWidth
      const fh = frame.clientHeight
      const frameRatio = fw / fh
      const natRatio = nat.w / nat.h
      let width: number
      let height: number
      if (natRatio > frameRatio) {
        // Image is wider than frame → fit width, letterbox top/bottom.
        width = fw
        height = fw / natRatio
      } else {
        height = fh
        width = fh * natRatio
      }
      setImgBox({
        left: (fw - width) / 2,
        top: (fh - height) / 2,
        width,
        height,
      })
    }
    update()
    const ro = new ResizeObserver(update)
    if (frameRef.current) ro.observe(frameRef.current)
    return () => ro.disconnect()
  }, [imgNatural])

  /**
   * Translate a pointer event to delta-percent on each axis. We keep
   * the raw pointer in client space and convert per move so a window
   * resize mid-drag doesn't desync.
   */
  const startDrag = (
    e: React.PointerEvent,
    /** How the rect should mutate from a pixel delta. */
    apply: (deltaXPct: number, deltaYPct: number, startRect: CropRect) => CropRect
  ) => {
    if (!imgBox) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startRect = { ...rect }
    const target = e.currentTarget as Element
    // setPointerCapture can throw NotFoundError if the browser hasn't
    // registered an active pointer for this id (e.g. synthetic events,
    // or some touch handoffs). Capture is a nice-to-have — without it
    // the window-level pointermove/up still fire — so swallow the error
    // and proceed rather than surface noise in the console.
    try {
      target.setPointerCapture?.(e.pointerId)
    } catch {
      /* capture is best-effort */
    }

    const move = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / imgBox.width) * 100
      const dyPct = ((ev.clientY - startY) / imgBox.height) * 100
      const next = clampRect(apply(dxPct, dyPct, startRect))
      onChangeRef.current(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try {
        target.releasePointerCapture?.(e.pointerId)
      } catch {
        /* nothing to do — capture may have already been released */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /**
   * Clamp the crop rect to [0..100] on each axis with a 5% min size
   * matching the schema's lower bound.
   */
  const clampRect = (r: CropRect): CropRect => {
    const w = Math.max(5, Math.min(100, r.widthPct))
    const h = Math.max(5, Math.min(100, r.heightPct))
    const x = Math.max(0, Math.min(100 - w, r.xPct))
    const y = Math.max(0, Math.min(100 - h, r.yPct))
    return { xPct: x, yPct: y, widthPct: w, heightPct: h }
  }

  /**
   * Resize from a corner / edge. Direction encodes which sides move:
   * 'l' or 'r' on the X axis, 't' or 'b' on the Y axis. When the
   * caller passes both, both axes move (corner). When the caller
   * passes only one, the opposite axis stays fixed (edge handle).
   *
   * Aspect lock: when defined, the dragged corner drives the
   * dominant axis and the other axis snaps to the ratio. We choose
   * the dominant axis by which delta moved more in pixels.
   */
  const resizeFrom = (
    horiz: 'l' | 'r' | null,
    vert: 't' | 'b' | null,
    deltaXPct: number,
    deltaYPct: number,
    start: CropRect
  ): CropRect => {
    let x = start.xPct
    let y = start.yPct
    let w = start.widthPct
    let h = start.heightPct

    if (aspectLock) {
      // Pick the larger movement (in image-pct space, normalized so
      // both axes count equally) and use it to drive both dims.
      const useHoriz = horiz != null && Math.abs(deltaXPct) >= Math.abs(deltaYPct)
      if (useHoriz && horiz) {
        w = horiz === 'r' ? start.widthPct + deltaXPct : start.widthPct - deltaXPct
        if (horiz === 'l') x = start.xPct + deltaXPct
        h = w / aspectLock
        if (vert === 't') y = start.yPct + (start.heightPct - h)
        else if (vert === 'b') y = start.yPct
        else y = start.yPct + (start.heightPct - h) / 2
      } else if (vert) {
        h = vert === 'b' ? start.heightPct + deltaYPct : start.heightPct - deltaYPct
        if (vert === 't') y = start.yPct + deltaYPct
        w = h * aspectLock
        if (horiz === 'l') x = start.xPct + (start.widthPct - w)
        else if (horiz === 'r') x = start.xPct
        else x = start.xPct + (start.widthPct - w) / 2
      }
    } else {
      if (horiz === 'r') w = start.widthPct + deltaXPct
      if (horiz === 'l') {
        w = start.widthPct - deltaXPct
        x = start.xPct + deltaXPct
      }
      if (vert === 'b') h = start.heightPct + deltaYPct
      if (vert === 't') {
        h = start.heightPct - deltaYPct
        y = start.yPct + deltaYPct
      }
    }
    return { xPct: x, yPct: y, widthPct: w, heightPct: h }
  }

  if (!imageUrl) {
    return (
      <div className={cn('flex items-center justify-center rounded-md border bg-black/40 text-xs text-muted-foreground', className)}>
        No image
      </div>
    )
  }

  // Crop rect translated to pixel coordinates inside the rendered
  // image box. Used to position the overlay handles.
  const cropPx = imgBox
    ? {
        left: imgBox.left + (rect.xPct / 100) * imgBox.width,
        top: imgBox.top + (rect.yPct / 100) * imgBox.height,
        width: (rect.widthPct / 100) * imgBox.width,
        height: (rect.heightPct / 100) * imgBox.height,
      }
    : null

  return (
    <div
      ref={frameRef}
      className={cn(
        'relative select-none overflow-hidden rounded-md border bg-black/60',
        className
      )}
    >
      {/* Source image, fitted contain so the user always sees the
          full frame they're cropping from. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 m-auto block max-h-full max-w-full"
        onLoad={(e) => {
          const el = e.currentTarget
          setImgNatural({ w: el.naturalWidth, h: el.naturalHeight })
        }}
      />

      {cropPx ? (
        <>
          {/* Dim mask: 4 rectangles around the crop rect so the cropped
              region pops while the rest dims to 50% black. Cheaper and
              more reliable than a single SVG mask, and prints crisp at
              any DPR. */}
          <div className="pointer-events-none absolute bg-black/55" style={{ left: 0, top: 0, right: 0, height: cropPx.top }} />
          <div className="pointer-events-none absolute bg-black/55" style={{ left: 0, top: cropPx.top + cropPx.height, right: 0, bottom: 0 }} />
          <div className="pointer-events-none absolute bg-black/55" style={{ left: 0, top: cropPx.top, width: cropPx.left, height: cropPx.height }} />
          <div className="pointer-events-none absolute bg-black/55" style={{ left: cropPx.left + cropPx.width, top: cropPx.top, right: 0, height: cropPx.height }} />

          {/* The crop rectangle itself — center is the pan grab area;
              edges and corners get their own handles for resize. */}
          <div
            className="absolute cursor-move ring-2 ring-primary"
            style={{
              left: cropPx.left,
              top: cropPx.top,
              width: cropPx.width,
              height: cropPx.height,
            }}
            onPointerDown={(e) =>
              startDrag(e, (dx, dy, s) => ({
                xPct: s.xPct + dx,
                yPct: s.yPct + dy,
                widthPct: s.widthPct,
                heightPct: s.heightPct,
              }))
            }
          >
            {/* Rule-of-thirds grid — purely cosmetic, helps users
                line up subjects. Hidden behind handles so it never
                steals their pointer events. */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/3 top-0 h-full w-px bg-white/30" />
              <div className="absolute left-2/3 top-0 h-full w-px bg-white/30" />
              <div className="absolute left-0 top-1/3 h-px w-full bg-white/30" />
              <div className="absolute left-0 top-2/3 h-px w-full bg-white/30" />
            </div>

            {/* 4 edge handles — these are full-edge drag strips so the
                user doesn't have to aim at a single pixel. */}
            <span
              onPointerDown={(e) =>
                startDrag(e, (dx, dy, s) => resizeFrom(null, 't', dx, dy, s))
              }
              className="absolute -top-1.5 left-3 right-3 h-3 cursor-ns-resize"
              aria-label="Resize top"
            />
            <span
              onPointerDown={(e) =>
                startDrag(e, (dx, dy, s) => resizeFrom(null, 'b', dx, dy, s))
              }
              className="absolute -bottom-1.5 left-3 right-3 h-3 cursor-ns-resize"
              aria-label="Resize bottom"
            />
            <span
              onPointerDown={(e) =>
                startDrag(e, (dx, dy, s) => resizeFrom('l', null, dx, dy, s))
              }
              className="absolute -left-1.5 top-3 bottom-3 w-3 cursor-ew-resize"
              aria-label="Resize left"
            />
            <span
              onPointerDown={(e) =>
                startDrag(e, (dx, dy, s) => resizeFrom('r', null, dx, dy, s))
              }
              className="absolute -right-1.5 top-3 bottom-3 w-3 cursor-ew-resize"
              aria-label="Resize right"
            />

            {/* 4 corner handles — visible square markers on top of the
                edge strips. Their cursors hint at the direction the
                handle pulls in. */}
            <span
              onPointerDown={(e) =>
                startDrag(e, (dx, dy, s) => resizeFrom('l', 't', dx, dy, s))
              }
              className="absolute -left-1.5 -top-1.5 size-3 cursor-nwse-resize rounded-sm border border-primary bg-background"
            />
            <span
              onPointerDown={(e) =>
                startDrag(e, (dx, dy, s) => resizeFrom('r', 't', dx, dy, s))
              }
              className="absolute -right-1.5 -top-1.5 size-3 cursor-nesw-resize rounded-sm border border-primary bg-background"
            />
            <span
              onPointerDown={(e) =>
                startDrag(e, (dx, dy, s) => resizeFrom('l', 'b', dx, dy, s))
              }
              className="absolute -left-1.5 -bottom-1.5 size-3 cursor-nesw-resize rounded-sm border border-primary bg-background"
            />
            <span
              onPointerDown={(e) =>
                startDrag(e, (dx, dy, s) => resizeFrom('r', 'b', dx, dy, s))
              }
              className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border border-primary bg-background"
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
