'use client'

import { useEffect, useState } from 'react'
import { Type } from 'lucide-react'
import { ALLOWED_FONT_IDS } from '@news-tok/shared/text-styles'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { FONT_LABEL } from '@/lib/font-label'

/**
 * CSS font stack the Studio uses to PREVIEW each logical font id. The
 * renderer-side mapping lives in packages/remotion/src/scenes/fonts.ts
 * — the names here are what Next.js / Google Fonts serves to the browser
 * for the picker cards. Falls back to a sane system stack if a face
 * hasn't loaded yet (the preview still reads, just less faithfully).
 */
const FONT_CSS: Record<string, string> = {
  beVietnamPro: '"Be Vietnam Pro", system-ui, sans-serif',
  inter: 'Inter, system-ui, sans-serif',
  montserrat: 'Montserrat, system-ui, sans-serif',
  anton: 'Anton, "Arial Narrow", sans-serif',
  bebasNeue: '"Bebas Neue", "Arial Narrow", sans-serif',
  playfairDisplay: '"Playfair Display", Georgia, serif',
  jetBrainsMono: '"JetBrains Mono", ui-monospace, monospace',
  lexend: 'Lexend, system-ui, sans-serif',
  manrope: 'Manrope, system-ui, sans-serif',
  oswald: 'Oswald, "Arial Narrow", sans-serif',
  archivoBlack: '"Archivo Black", system-ui, sans-serif',
  nunito: 'Nunito, system-ui, sans-serif',
}

const FONT_NOTE: Record<string, string> = {
  beVietnamPro: 'Default VI body — diacritics tuned natively',
  inter: 'Default EN body — universal sans',
  montserrat: 'TikTok / Hormozi headline (Black 900)',
  anton: 'Condensed display, single weight',
  bebasNeue: 'Condensed all-caps display',
  playfairDisplay: 'Editorial serif — luxury / quote',
  jetBrainsMono: 'Monospaced — typewriter / code',
  lexend: 'Max-legibility sans — caption / body',
  manrope: 'Modern geometric — explainer',
  oswald: 'Condensed with weight range',
  archivoBlack: 'Block-bold display, intrinsic stroke',
  nunito: 'Rounded friendly sans — playful',
}

function FontCard({
  fontId,
  selected,
  onSelect,
  sampleText,
}: {
  fontId: string
  selected: boolean
  onSelect: () => void
  sampleText: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex h-32 flex-col justify-between overflow-hidden rounded-md border bg-secondary/30 p-3 text-left transition-all hover:bg-secondary/60',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border'
      )}
    >
      <div
        className="flex flex-1 items-center"
        style={{
          fontFamily: FONT_CSS[fontId] ?? 'system-ui',
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.15,
        }}
      >
        <span className="line-clamp-2">{sampleText}</span>
      </div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="truncate font-medium text-foreground">
          {FONT_LABEL[fontId] ?? fontId}
        </span>
      </div>
      <div className="line-clamp-1 text-[10px] text-muted-foreground">
        {FONT_NOTE[fontId] ?? ''}
      </div>
    </button>
  )
}

export type FontPickerProps = {
  /** Currently applied font id (highlighted in the grid). */
  currentFontId?: string
  /** Sample text rendered on every card — usually the segment headline. */
  sampleText: string
  /**
   * When set, the picker shows a "This segment in variant X only" option as
   * the safest default so font edits do not leak into other variants of
   * the same project.
   */
  activeVariantId?: string | null
  onApply: (input: {
    fontId: string
    scope: 'segmentInVariant' | 'segment' | 'all'
  }) => void
  trigger: React.ReactNode
}

export function FontPicker({
  currentFontId,
  sampleText,
  activeVariantId,
  onApply,
  trigger,
}: FontPickerProps) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string | null>(currentFontId ?? null)

  useEffect(() => {
    if (open) setPicked(currentFontId ?? null)
  }, [open, currentFontId])

  const apply = (scope: 'segmentInVariant' | 'segment' | 'all') => {
    if (!picked) return
    onApply({ fontId: picked, scope })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="size-5" />
            Pick a font
          </DialogTitle>
          <DialogDescription>
            Override the typeface for this segment without forking the whole text
            style. The renderer prefers segment / variant overrides before the
            style's own font.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
          {ALLOWED_FONT_IDS.map((id) => (
            <FontCard
              key={id}
              fontId={id}
              selected={picked === id}
              onSelect={() => setPicked(id)}
              sampleText={sampleText.length > 60 ? sampleText.slice(0, 58) + '…' : sampleText}
            />
          ))}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:flex-wrap sm:space-x-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {activeVariantId ? (
            <Button
              disabled={!picked}
              onClick={() => apply('segmentInVariant')}
              title={`Pin font to this segment in variant ${activeVariantId} only`}
            >
              Segment · variant {activeVariantId}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={!picked}
            onClick={() => apply('segment')}
            title="Apply font to this segment across every variant"
          >
            Segment · all variants
          </Button>
          <Button
            variant="outline"
            disabled={!picked}
            onClick={() => apply('all')}
            title="Apply font to every segment in the project"
          >
            All segments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
