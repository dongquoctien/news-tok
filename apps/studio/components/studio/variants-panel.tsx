'use client'

import { Loader2, PlayCircle, Eye, Film } from 'lucide-react'
import type { Project, Variant } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
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
  /** Map of variantId → output mp4 absolute path (from previous renders). */
  outputs?: Record<string, string>
}

function styleSummary(v: Variant): string {
  const entries = Object.entries(v.textStyleBySceneKind)
  if (entries.length === 0) return '—'
  return entries.map(([scene, styleId]) => `${scene}=${styleId}`).join(' · ')
}

export function VariantsPanel({
  project,
  activeVariantId,
  onSelectVariant,
  onRenderVariant,
  renderingVariantId,
  outputs = {},
}: VariantsPanelProps) {
  const variants = project.variants ?? []
  if (variants.length === 0) {
    return (
      <div className="w-full rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        No variants declared on this project. Ask Claude to seed variants, or
        the project will render a single <code>output.mp4</code> using each
        scene&apos;s default style.
      </div>
    )
  }
  return (
    <div className="w-full max-w-[420px] space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Variants</span>
        <button
          onClick={() => onSelectVariant(null)}
          className={cn(
            'rounded px-2 py-0.5',
            activeVariantId === null
              ? 'bg-secondary text-foreground'
              : 'hover:bg-secondary/60'
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
          const hasOutput = Boolean(outputs[v.id])
          return (
            <li
              key={v.id}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                isActive ? 'border-primary bg-primary/10' : 'border-border'
              )}
            >
              <button
                onClick={() => onSelectVariant(v.id)}
                className="flex flex-1 items-center gap-2 text-left"
                title={`Preview variant ${v.id}`}
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
              {hasOutput ? (
                <span
                  className="text-[10px] text-emerald-400"
                  title={outputs[v.id]}
                >
                  <Film className="inline size-3" /> mp4
                </span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRenderVariant(v.id)}
                disabled={renderingVariantId != null}
                title={`Render variant ${v.id} to output-${v.id}.mp4`}
              >
                {isRendering ? <Loader2 className="animate-spin" /> : <PlayCircle />}
                Render
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
