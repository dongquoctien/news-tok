'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Crop,
  FlipHorizontal,
  FlipVertical,
  Image as ImageIcon,
  RotateCcw,
  RotateCw,
} from 'lucide-react'
import type {
  Aspect,
  AssetRef,
  BackgroundEdits,
} from '@news-tok/shared/schema'
import { assetUrl } from '@/lib/asset-url'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { CropperCanvas, type CropRect } from '@/components/studio/cropper-canvas'
import { cn } from '@/lib/utils'

/**
 * Non-destructive image editor. Mutates a `BackgroundEdits` object that
 * the renderer composes as CSS transform / clip-path / overlay layers.
 * Live preview uses the exact same CSS the Remotion KenBurns component
 * applies, so what the user sees in the dialog matches the output mp4.
 *
 * The original image file is never touched — multiple segments can use
 * the same library asset with different edits (cropped close-up here,
 * full bleed there).
 */

const DEFAULT_EDITS: BackgroundEdits = {
  rotateDeg: 0,
  flipH: false,
  flipV: false,
  vignette: 0,
}

type CropPreset = 'free' | 'original' | '9:16' | '1:1' | '16:9'

const CROP_PRESETS: { id: CropPreset; label: string; ratio?: number }[] = [
  { id: 'free', label: 'Free' },
  { id: 'original', label: 'Original' },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
]

const OVERLAY_PRESETS: { label: string; color: string; opacity: number; blendMode: BackgroundEdits['overlay'] extends infer T ? (T extends { blendMode: infer B } ? B : never) : never }[] = [
  // keep TS happy — narrow blendMode literal via the schema's enum
  { label: 'None', color: '', opacity: 0, blendMode: 'normal' as const },
  { label: 'Dark plate', color: '#000000', opacity: 0.35, blendMode: 'normal' as const },
  { label: 'Cinematic teal', color: '#0ea5e9', opacity: 0.25, blendMode: 'soft-light' as const },
  { label: 'Warm sunset', color: '#f59e0b', opacity: 0.25, blendMode: 'soft-light' as const },
  { label: 'Brand violet', color: '#7c3aed', opacity: 0.30, blendMode: 'soft-light' as const },
] as Array<{ label: string; color: string; opacity: number; blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' }>

/**
 * Compute the CSS that the Remotion renderer will apply for the given
 * edits. Mirrors the logic in `packages/remotion/src/effects/KenBurns.tsx`
 * — keep them in lockstep so the preview never drifts from the render.
 */
function previewStyle(edits: BackgroundEdits): {
  imgStyle: React.CSSProperties
  overlayStyle: React.CSSProperties | null
  vignetteStyle: React.CSSProperties | null
} {
  const transforms: string[] = []
  if (edits.rotateDeg) transforms.push(`rotate(${edits.rotateDeg}deg)`)
  if (edits.flipH) transforms.push('scaleX(-1)')
  if (edits.flipV) transforms.push('scaleY(-1)')

  let cropScale = 1
  let objectPosition: string | undefined
  if (edits.crop) {
    const c = edits.crop
    cropScale = 100 / Math.max(c.widthPct, 1)
    objectPosition = `${c.xPct + c.widthPct / 2}% ${c.yPct + c.heightPct / 2}%`
  }

  return {
    imgStyle: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition,
      transform: `${transforms.join(' ')} scale(${cropScale})`.trim(),
      transformOrigin: 'center center',
      display: 'block',
    },
    overlayStyle:
      edits.overlay && edits.overlay.opacity > 0
        ? {
            position: 'absolute',
            inset: 0,
            background: edits.overlay.color,
            opacity: edits.overlay.opacity,
            mixBlendMode: edits.overlay.blendMode,
            pointerEvents: 'none',
          }
        : null,
    vignetteStyle:
      edits.vignette > 0
        ? {
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,${edits.vignette}) 100%)`,
            pointerEvents: 'none',
          }
        : null,
  }
}

/**
 * Apply an aspect-ratio crop preset.
 *
 *   - 'original' resets to the full image (no crop).
 *   - 'free' keeps whatever rect is already there (just unlocks aspect).
 *   - '9:16' / '1:1' / '16:9' resize the *existing* rect to match the
 *     ratio while keeping its center fixed where possible. We do NOT
 *     re-center on the image — the user may have already panned to put
 *     the subject in a corner, and clobbering that is the bug we're
 *     fixing here. If the new rect would fall off the edge after
 *     centering on the old rect, we clamp into bounds.
 *
 * `imgW` / `imgH` give the source image's natural aspect; we need it
 * because the crop coordinates are stored as percentages, so a 1:1
 * visual ratio on a 16:9 image is 100% × 56.25% in source-percent
 * units. The preview's aspect-lock value is computed the same way.
 */
function applyCropPreset(
  preset: CropPreset,
  imgW: number,
  imgH: number,
  current: CropRect
): CropRect | undefined {
  if (preset === 'original') return undefined
  if (preset === 'free') return current
  const targetRatio =
    preset === '9:16' ? 9 / 16 : preset === '1:1' ? 1 : 16 / 9
  const sourceRatio = imgW / imgH
  // Want the new visual rect to match targetRatio. In source-percent
  // space, that means widthPct / heightPct === targetRatio / sourceRatio.
  const ratioInPct = targetRatio / sourceRatio
  // Try to keep the existing width and derive height; if that would
  // overflow, fall back to keeping the height and deriving width.
  let widthPct = current.widthPct
  let heightPct = widthPct / ratioInPct
  if (heightPct > 100) {
    heightPct = current.heightPct
    widthPct = heightPct * ratioInPct
  }
  if (widthPct > 100) {
    widthPct = 100
    heightPct = widthPct / ratioInPct
  }
  if (heightPct > 100) {
    heightPct = 100
    widthPct = heightPct * ratioInPct
  }
  // Center the new rect on the old rect, then clamp into bounds.
  const cx = current.xPct + current.widthPct / 2
  const cy = current.yPct + current.heightPct / 2
  let xPct = cx - widthPct / 2
  let yPct = cy - heightPct / 2
  xPct = Math.max(0, Math.min(100 - widthPct, xPct))
  yPct = Math.max(0, Math.min(100 - heightPct, yPct))
  return { xPct, yPct, widthPct, heightPct }
}

/** Default crop = full image, so the cropper is always interactive. */
const FULL_RECT: CropRect = { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 }

export function ImageEditorDialog({
  open,
  onOpenChange,
  asset,
  initialEdits,
  /** Project aspect — drives the preview frame ratio. */
  projectAspect,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: AssetRef | null
  initialEdits?: BackgroundEdits
  projectAspect?: Aspect
  onApply: (edits: BackgroundEdits | undefined) => void
}) {
  const [edits, setEdits] = useState<BackgroundEdits>(
    initialEdits ?? DEFAULT_EDITS
  )
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  /**
   * Tracks the user's last preset choice so resize stays aspect-locked
   * after they pick e.g. 9:16. Free unlocks aspect; Original drops the
   * crop back to identity. The active preset is also derived from this
   * for the chip highlight, so the highlight stays correct even after
   * sub-pixel rounding from drag-resize.
   */
  const [cropPreset, setCropPreset] = useState<CropPreset>('free')
  const previewRef = useRef<HTMLDivElement | null>(null)

  // Reset state every time the dialog opens or the asset changes —
  // otherwise stale edits from the previous segment would leak in.
  useEffect(() => {
    if (open) {
      setEdits(initialEdits ?? DEFAULT_EDITS)
      setCropPreset(initialEdits?.crop ? 'free' : 'original')
    }
  }, [open, initialEdits])

  const url = asset ? assetUrl(asset.path) : null
  const styles = useMemo(() => previewStyle(edits), [edits])

  // Fetch natural image dimensions up-front so we can compute aspect
  // locks and "Result" preview ratios before the cropper finishes
  // mounting. Keyed on `url` so swapping assets refetches.
  useEffect(() => {
    if (!url) {
      setImgDims(null)
      return
    }
    const img = new window.Image()
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }, [url])

  // Aspect-lock value passed to the cropper: ratio in source-percent
  // space (so a 1:1 visual crop on a 16:9 image locks to a 0.5625
  // pct ratio). Undefined when Free preset is active.
  const aspectLock: number | undefined = (() => {
    if (!imgDims || cropPreset === 'free' || cropPreset === 'original') return undefined
    const targetVisual = cropPreset === '9:16' ? 9 / 16 : cropPreset === '1:1' ? 1 : 16 / 9
    const sourceRatio = imgDims.w / imgDims.h
    return targetVisual / sourceRatio
  })()

  // The preview frame mirrors the project aspect so the user sees what
  // a renderer crop will look like. The renderer's `objectFit: cover`
  // crops to the frame regardless, so we just force the same ratio
  // here and let the styles above show how the crop/transform sits
  // inside it.
  const aspectRatio =
    projectAspect === '16:9' ? '16 / 9' : projectAspect === '1:1' ? '1 / 1' : '9 / 16'
  // Numeric ratio drives the max-width clamp below — given a 60vh
  // height cap, this is the matching width that keeps the preview
  // inside the dialog body for any aspect.
  const aspectFloat =
    projectAspect === '16:9' ? 16 / 9 : projectAspect === '1:1' ? 1 : 9 / 16

  const updateOverlay = (
    next: Partial<NonNullable<BackgroundEdits['overlay']>> | null
  ) => {
    if (next === null) {
      setEdits((e) => ({ ...e, overlay: undefined }))
      return
    }
    setEdits((e) => ({
      ...e,
      overlay: {
        color: e.overlay?.color ?? '#000000',
        opacity: e.overlay?.opacity ?? 0.35,
        blendMode: e.overlay?.blendMode ?? 'normal',
        ...next,
      },
    }))
  }

  const isDirty = JSON.stringify(edits) !== JSON.stringify(initialEdits ?? DEFAULT_EDITS)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Cap dialog height to the viewport and lay it out as a flex
          column so header + footer stay sticky while the body scrolls.
          Without this, the controls + preview can overflow off-screen
          and clip the title row and Apply/Cancel buttons. */}
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="size-5" />
            Edit background image
          </DialogTitle>
          <DialogDescription>
            Crop, rotate, flip, and add a darkening overlay. Edits are
            non-destructive — the original file stays untouched, so the
            same library image can be cropped differently across
            segments.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4 md:grid-cols-[1fr_280px]">
          {/* Cropper canvas — full source image with a draggable +
              resizable crop rectangle on top. The cropped region pops
              from the dimmed surrounding mask. Below it sits a small
              "Result" tile that mirrors how the rendered video will
              cover-fit the same crop into the project aspect. */}
          <div className="space-y-2">
            <CropperCanvas
              imageUrl={url}
              rect={edits.crop ?? FULL_RECT}
              onChange={(next) =>
                setEdits((e) => ({ ...e, crop: next }))
              }
              aspectLock={aspectLock}
              className="mx-auto h-[55vh] w-full max-w-full"
            />
            {/* Tiny result preview — re-uses the same CSS the renderer
                applies, so the user sees the cover-fit output of their
                crop choice. Width matches the project aspect. */}
            <div className="flex items-start gap-3">
              <div
                ref={previewRef}
                className="relative shrink-0 overflow-hidden rounded border bg-black/40"
                style={{
                  aspectRatio,
                  height: 96,
                  width: `${96 * aspectFloat}px`,
                }}
              >
                {url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={styles.imgStyle} />
                    {styles.overlayStyle ? <div style={styles.overlayStyle} /> : null}
                    {styles.vignetteStyle ? <div style={styles.vignetteStyle} /> : null}
                  </>
                ) : null}
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Drag the rectangle to pan, or pull a handle to resize. The
                small tile shows the cover-fit result that lands in the
                rendered {projectAspect ?? '9:16'} video.
              </p>
            </div>
          </div>

          {/* Right rail — all controls grouped by intent. */}
          <div className="space-y-4 overflow-y-auto pr-1">
            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Crop className="size-3.5" />
                Crop
              </div>
              <div className="flex flex-wrap gap-1">
                {CROP_PRESETS.map((p) => {
                  const active = cropPreset === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const w = imgDims?.w ?? 1080
                        const h = imgDims?.h ?? 1920
                        setCropPreset(p.id)
                        setEdits((e) => ({
                          ...e,
                          crop: applyCropPreset(p.id, w, h, e.crop ?? FULL_RECT),
                        }))
                      }}
                      className={cn(
                        'rounded border px-2 py-1 text-[11px] font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-input text-muted-foreground hover:bg-secondary'
                      )}
                    >
                      {p.label}
                    </button>
                  )
                })}
                {edits.crop ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCropPreset('original')
                      setEdits((e) => ({ ...e, crop: undefined }))
                    }}
                    className="ml-auto rounded px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    title="Remove crop and use the full image"
                  >
                    clear
                  </button>
                ) : null}
              </div>
              {edits.crop ? (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Drag the rectangle on the preview to pan, or pull a
                  handle to resize. Aspect-locked when a preset is
                  active; switch to <strong>Free</strong> for arbitrary
                  rectangles.
                </p>
              ) : (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  No crop — the full image is used. Pick an aspect to
                  start cropping.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <RotateCw className="size-3.5" />
                Rotate &amp; flip
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setEdits((e) => ({
                      ...e,
                      rotateDeg: ((e.rotateDeg - 90 + 540) % 360) - 180,
                    }))
                  }
                  title="Rotate 90° counter-clockwise"
                >
                  <RotateCcw className="size-3.5" />
                  -90°
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setEdits((e) => ({
                      ...e,
                      rotateDeg: ((e.rotateDeg + 90 + 540) % 360) - 180,
                    }))
                  }
                  title="Rotate 90° clockwise"
                >
                  <RotateCw className="size-3.5" />
                  +90°
                </Button>
                <Button
                  type="button"
                  variant={edits.flipH ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEdits((e) => ({ ...e, flipH: !e.flipH }))}
                  title="Flip horizontally"
                >
                  <FlipHorizontal className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant={edits.flipV ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEdits((e) => ({ ...e, flipV: !e.flipV }))}
                  title="Flip vertically"
                >
                  <FlipVertical className="size-3.5" />
                </Button>
              </div>
              <Slider
                label="Free angle"
                value={edits.rotateDeg}
                min={-180}
                max={180}
                step={1}
                resetTo={0}
                formatValue={(v) => `${v}°`}
                onChange={(v) => setEdits((e) => ({ ...e, rotateDeg: v }))}
              />
            </section>

            <section className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Vignette
              </div>
              <Slider
                value={edits.vignette}
                min={0}
                max={1}
                step={0.05}
                resetTo={0}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setEdits((e) => ({ ...e, vignette: v }))}
                ariaLabel="Vignette intensity"
              />
            </section>

            <section className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Overlay
              </div>
              <div className="flex flex-wrap gap-1">
                {OVERLAY_PRESETS.map((p) => {
                  const isActive =
                    p.label === 'None'
                      ? !edits.overlay
                      : edits.overlay?.color === p.color &&
                        Math.abs((edits.overlay?.opacity ?? 0) - p.opacity) < 0.01 &&
                        edits.overlay?.blendMode === p.blendMode
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        if (p.label === 'None') updateOverlay(null)
                        else
                          updateOverlay({
                            color: p.color,
                            opacity: p.opacity,
                            blendMode: p.blendMode,
                          })
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors',
                        isActive
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-input text-muted-foreground hover:bg-secondary'
                      )}
                    >
                      {p.label !== 'None' ? (
                        <span
                          className="size-3 rounded-sm border border-white/20"
                          style={{ background: p.color }}
                        />
                      ) : null}
                      {p.label}
                    </button>
                  )
                })}
              </div>
              {edits.overlay ? (
                <div className="space-y-2 rounded border border-dashed bg-muted/40 p-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground" htmlFor="overlay-color">
                      Color
                    </label>
                    <input
                      id="overlay-color"
                      type="color"
                      value={edits.overlay.color}
                      onChange={(e) => updateOverlay({ color: e.target.value })}
                      className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent"
                    />
                    <select
                      value={edits.overlay.blendMode}
                      onChange={(e) =>
                        updateOverlay({
                          blendMode: e.target.value as NonNullable<
                            BackgroundEdits['overlay']
                          >['blendMode'],
                        })
                      }
                      className="h-6 flex-1 rounded border border-input bg-background px-1 text-[11px]"
                    >
                      <option value="normal">Normal</option>
                      <option value="multiply">Multiply</option>
                      <option value="screen">Screen</option>
                      <option value="overlay">Overlay</option>
                      <option value="soft-light">Soft light</option>
                    </select>
                  </div>
                  <Slider
                    label="Opacity"
                    value={edits.overlay.opacity}
                    min={0}
                    max={1}
                    step={0.05}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => updateOverlay({ opacity: v })}
                  />
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <DialogFooter className="items-center justify-between border-t bg-background px-6 py-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEdits(DEFAULT_EDITS)}
            disabled={!isDirty && !edits.crop}
          >
            Reset all
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                // Pass undefined when edits collapse to identity so the
                // segment storyboard stays clean instead of carrying a
                // no-op { rotateDeg: 0, flipH: false, ... } object.
                const isIdentity =
                  !edits.crop &&
                  edits.rotateDeg === 0 &&
                  !edits.flipH &&
                  !edits.flipV &&
                  edits.vignette === 0 &&
                  !edits.overlay
                onApply(isIdentity ? undefined : edits)
                onOpenChange(false)
              }}
            >
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
