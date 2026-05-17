'use client'

import { useState } from 'react'
import { Loader2, PlayCircle, Eye, Film, X } from 'lucide-react'
import type { Project, Variant } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'

export type VariantsPanelProps = {
  project: Project
  /** Variant currently shown in the player preview. */
  activeVariantId: string | null
  onSelectVariant: (variantId: string | null) => void
  /**
   * Kick off a render for one variant. The parent owns the actual
   * fetch + job polling — we just emit which variant was clicked.
   */
  onRenderVariant: (variantId: string) => void
  /** Variant currently being rendered (one at a time). */
  renderingVariantId?: string | null
  /**
   * Live progress for the variant identified by `renderingVariantId`.
   * Range 0..1 (matches Remotion's `onProgress` callback). The panel
   * formats this as a percentage in the status slot beside the spinner
   * so users can tell whether ffmpeg is 5% in or 95% in.
   */
  renderProgress?: number
  /** Map of variantId → output mp4 absolute path (from previous renders). */
  outputs?: Record<string, string>
}

function styleSummary(v: Variant): string {
  const entries = Object.entries(v.textStyleBySceneKind)
  if (entries.length === 0) return '—'
  return entries.map(([scene, styleId]) => `${scene}=${styleId}`).join(' · ')
}

function VideoModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Close preview"
        >
          <X className="size-4" />
          Close
        </button>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={src}
          controls
          autoPlay
          loop
          className="block w-full rounded-md border border-border bg-black"
        />
      </div>
    </div>
  )
}

export function VariantsPanel({
  project,
  activeVariantId,
  onSelectVariant,
  onRenderVariant,
  renderingVariantId,
  renderProgress,
  outputs = {},
}: VariantsPanelProps) {
  const [openedVideoUrl, setOpenedVideoUrl] = useState<string | null>(null)

  const variants = project.variants ?? []
  if (variants.length === 0) {
    return (
      <div className="w-full max-w-[420px] rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        No variants declared on this project. Ask Claude to seed variants, or
        the project will render a single <code>output.mp4</code> using each
        scene&apos;s default style.
      </div>
    )
  }

  return (
    <>
      <div className="w-full max-w-[420px] space-y-1.5">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Variants</span>
          <button
            onClick={() => onSelectVariant(null)}
            className={cn(
              'rounded border px-2 py-0.5 transition-colors',
              activeVariantId === null
                ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary/40'
                : 'border-border bg-card text-muted-foreground hover:bg-secondary/60'
            )}
            title="Preview the default render (no variantId — first declared variant wins)"
          >
            default
          </button>
        </div>
        <ul className="space-y-1">
          {variants.map((v) => {
            const isActive = v.id === activeVariantId
            const isRendering = renderingVariantId === v.id
            const outputPath = outputs[v.id]
            const hasOutput = Boolean(outputPath)
            return (
              <li
                key={v.id}
                className={cn(
                  // Grid keeps the three columns aligned across rows even
                  // when individual cells are missing (no mp4 yet, etc.).
                  'grid grid-cols-[1fr_72px_88px] items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'border-primary bg-primary/15 ring-1 ring-primary/40 shadow-sm'
                    : 'border-border bg-card hover:bg-secondary/50'
                )}
              >
                <button
                  onClick={() => onSelectVariant(v.id)}
                  className="flex min-w-0 items-center gap-2 text-left"
                  title={`Preview variant ${v.id} in the player`}
                >
                  <Eye className="size-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="font-semibold tracking-wide">
                      {v.id} · {v.label}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {styleSummary(v)}
                    </div>
                  </div>
                </button>

                {/* Fixed-width Open / state slot — always reserves space so
                    the Render button column stays at the same x. */}
                <div className="flex justify-end">
                  {hasOutput ? (
                    <button
                      onClick={() => {
                        const url = assetUrl(outputPath!)
                        if (url) setOpenedVideoUrl(url)
                      }}
                      className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                      title={`Open ${outputPath}`}
                    >
                      <Film className="size-3" />
                      Open
                    </button>
                  ) : isRendering ? (
                    <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      {typeof renderProgress === 'number'
                        ? `${Math.round(Math.max(0, Math.min(1, renderProgress)) * 100)}%`
                        : '…'}
                    </span>
                  ) : (
                    <span
                      className="text-[10px] text-muted-foreground/60"
                      title="No render yet"
                    >
                      —
                    </span>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRenderVariant(v.id)}
                    disabled={renderingVariantId != null}
                    title={`Render variant ${v.id} to output-${v.id}.mp4`}
                    className="w-full"
                  >
                    {isRendering ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <PlayCircle />
                    )}
                    Render
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      {openedVideoUrl ? (
        <VideoModal src={openedVideoUrl} onClose={() => setOpenedVideoUrl(null)} />
      ) : null}
    </>
  )
}
