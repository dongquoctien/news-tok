'use client'

import { useState } from 'react'
import { Check, Layout as LayoutIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { BUILT_IN_LAYOUTS } from '@/lib/layouts-catalog'
import { cn } from '@/lib/utils'

/**
 * Segment-editor layout picker. Grid of thumbnails — one per built-in
 * layout — with the current pick highlighted. Selecting and confirming
 * writes `segment.layoutId` via the parent's `onApply` callback.
 *
 * User-authored layouts at `data/layouts/<id>/` are not surfaced in
 * PR-C — the dropdown only lists built-ins. PR-D will merge in the
 * disk-scanned user pool.
 */
export function LayoutPicker({
  currentId,
  onApply,
  trigger,
}: {
  currentId: string | undefined
  onApply: (layoutId: string | undefined) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string | undefined>(currentId)

  const confirm = () => {
    onApply(picked)
    setOpen(false)
  }

  const clear = () => {
    onApply(undefined)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setPicked(currentId)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* grid-rows-[auto_1fr_auto] + max-h-[90vh] pins the title + footer
          and lets only the thumbnail grid scroll. Without this the
          9:16 thumbnails on portrait monitors pushed the dialog past
          the viewport and the user couldn't see the Apply button. */}
      <DialogContent className="grid max-h-[90vh] w-full max-w-3xl grid-rows-[auto_1fr_auto] gap-0 overflow-hidden p-0">
        <div className="space-y-1 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutIcon className="size-5" />
            Pick a layout
          </DialogTitle>
          <DialogDescription className="text-xs">
            Layouts decide how the headline, eyebrow, chips, and media land
            on the frame. Headline still picks up your text style, font,
            and colour — only the placement is layout-owned.
          </DialogDescription>
        </div>

        <div className="overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {BUILT_IN_LAYOUTS.map((layout) => {
              const selected = picked === layout.id
              return (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => setPicked(layout.id)}
                  className={cn(
                    'group relative overflow-hidden rounded-md border bg-secondary/20 text-left transition-colors',
                    selected
                      ? 'border-primary ring-2 ring-primary/50'
                      : 'border-border hover:border-muted-foreground/40 hover:bg-secondary/40'
                  )}
                >
                  {/* Full 9:16 thumbnail so users can read the actual
                      layout at a glance. The dialog body scrolls when
                      the grid overflows so this size doesn't push the
                      header / footer off-screen. */}
                  <div className="relative aspect-[9/16] overflow-hidden bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={layout.thumbnail}
                      alt={layout.name}
                      className="absolute inset-0 size-full object-cover"
                    />
                    {selected ? (
                      <div className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" />
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-1 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{layout.name}</span>
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                        {layout.family}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] text-muted-foreground">
                      {layout.hint}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {currentId ? (
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear (fall back to scene default)
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirm} disabled={!picked}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
