'use client'

import { useMemo, useState } from 'react'
import { Check, Search, Type } from 'lucide-react'
import type { Aspect, TextStyle } from '@news-tok/shared/schema'
import { ALLOWED_FONT_IDS } from '@news-tok/shared/text-styles'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { fontLabel } from '@/lib/font-label'
import { plateCss, previewFontStack, textCss } from '@/lib/text-style-preview'
import { cn } from '@/lib/utils'
import { DeviceMockupPreview, splitRatioFor } from './device-mockup-preview'

export type FontPickerDialogProps = {
  /** Currently-selected font id. */
  value: string
  /** Called when the user clicks Apply. */
  onChange: (id: string) => void
  /** Optional context that helps the right pane preview look like the
   *  final render: project aspect, current segment background, the
   *  style colour / size / weight / decorators so the preview text
   *  actually matches what's downstream. */
  context?: {
    aspect?: Aspect
    background?: string
    style: TextStyle
    sampleText: string
  }
  trigger: React.ReactNode
}

/**
 * Full-screen-friendly font picker with a live device-mockup preview.
 * Left: search + scrollable list of every font in `ALLOWED_FONT_IDS`,
 * each row rendered in its own face so users can scan typefaces visually.
 * Right: a phone/laptop frame showing the segment background with the
 * hovered (or picked) font applied to the current text style — so the
 * weight, colour, plate, and stroke from the caller's style all line up
 * with the final mp4 instead of using a default sample.
 */
export function FontPickerDialog({
  value,
  onChange,
  context,
  trigger,
}: FontPickerDialogProps) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(value)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return ALLOWED_FONT_IDS
    const q = query.toLowerCase()
    return ALLOWED_FONT_IDS.filter(
      (id) => id.toLowerCase().includes(q) || fontLabel(id).toLowerCase().includes(q)
    )
  }, [query])

  const previewAspect = context?.aspect ?? '9:16'
  const split = splitRatioFor(previewAspect)
  const previewedId = hoveredId ?? picked
  // Apply the previewed font over the existing style so weight / colour /
  // shadow / plate carry through and the preview looks like the real render.
  const previewedStyle: TextStyle | null = context?.style
    ? { ...context.style, fontFamily: previewedId }
    : null

  const apply = () => {
    onChange(picked)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          // Reset draft + hover each time the dialog opens so the previous
          // session's hover state doesn't bleed across opens.
          setPicked(value)
          setHoveredId(null)
          setQuery('')
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="grid max-h-[92vh] w-full max-w-5xl grid-rows-[auto_1fr_auto] gap-0 overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Type className="size-5" />
            Pick a font
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Hover a row to preview on the right; click to lock the pick.
            The preview uses your current colour, weight, and decorators
            so it matches the final render.
          </DialogDescription>
        </div>

        <div
          className="grid min-h-0 overflow-hidden"
          style={{ gridTemplateColumns: `${split.left} ${split.right}` }}
        >
          <div className="flex min-h-0 flex-col overflow-hidden border-r">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="size-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${ALLOWED_FONT_IDS.length} fonts…`}
                className="flex-1 bg-transparent text-sm focus:outline-none"
                autoFocus
              />
            </div>
            <ul
              className="flex-1 overflow-y-auto py-1"
              onMouseLeave={() => setHoveredId(null)}
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">No fonts match.</li>
              ) : null}
              {filtered.map((id) => {
                const isPicked = id === picked
                const isHovered = id === hoveredId
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredId(id)}
                      onFocus={() => setHoveredId(id)}
                      onClick={() => setPicked(id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors',
                        isPicked
                          ? 'bg-primary/10 text-foreground'
                          : isHovered
                            ? 'bg-secondary'
                            : 'hover:bg-secondary/50'
                      )}
                    >
                      <span
                        className="truncate text-base"
                        style={{ fontFamily: previewFontStack(id) }}
                      >
                        {fontLabel(id)}
                      </span>
                      {isPicked ? (
                        <Check className="size-4 shrink-0 text-primary" />
                      ) : (
                        <span
                          className="text-[10px] uppercase tracking-wide text-muted-foreground"
                          style={{ fontFamily: previewFontStack(id) }}
                        >
                          Aa Bb 123
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="flex min-h-0 items-center justify-center overflow-y-auto bg-secondary/20 p-4">
            <DeviceMockupPreview
              aspect={previewAspect}
              background={context?.background}
              label={previewedId ? fontLabel(previewedId) : 'Hover a font'}
            >
              {previewedStyle && context ? (
                <div style={plateCss(previewedStyle)}>
                  <span style={textCss(previewedStyle, 5)}>
                    {context.sampleText.length > 64
                      ? context.sampleText.slice(0, 60) + '…'
                      : context.sampleText}
                  </span>
                </div>
              ) : (
                <span
                  className="text-2xl text-white"
                  style={{
                    fontFamily: previewedId ? previewFontStack(previewedId) : undefined,
                  }}
                >
                  Aa Bb Cc 123
                </span>
              )}
            </DeviceMockupPreview>
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
