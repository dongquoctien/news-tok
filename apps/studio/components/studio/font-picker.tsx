'use client'

import { useEffect, useState } from 'react'
import { Check, Type } from 'lucide-react'
import {
  ALLOWED_FONT_IDS,
  findTextStyle,
} from '@news-tok/shared/text-styles'
import type { Aspect, TextStyle } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { FONT_LABEL } from '@/lib/font-label'
import {
  plateCss as libPlateCss,
  textCss as libTextCss,
} from '@/lib/text-style-preview'
import { DeviceMockupPreview, splitRatioFor } from './device-mockup-preview'

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
        'group relative flex h-32 flex-col justify-between overflow-hidden rounded-md border bg-secondary/30 p-3 text-left transition-all hover:bg-secondary/60',
        selected
          ? 'border-primary ring-2 ring-primary/50'
          : 'border-border'
      )}
    >
      {/* Check badge mirrors LayoutPicker / StylePicker for a
          consistent "active pick" affordance across all pickers. */}
      {selected ? (
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Check className="size-3.5" strokeWidth={3} />
        </div>
      ) : null}
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
  /** Resolved style for this segment so the preview pane renders the
   *  headline with the right plate / shadow / colour, only swapping
   *  fontFamily as the user clicks through the grid. Omit to fall
   *  back to the classic style. */
  resolvedStyle?: TextStyle | null
  /** Project aspect — drives the device frame (phone / laptop / square). */
  aspect?: Aspect
  /** Optional segment background image path. Drawn under the text so
   *  font weight / serif vs sans reads against the real composition. */
  previewBackground?: string
}

export function FontPicker({
  currentFontId,
  sampleText,
  activeVariantId,
  onApply,
  trigger,
  resolvedStyle,
  aspect,
  previewBackground,
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

  const previewAspect = aspect ?? '9:16'
  const split = splitRatioFor(previewAspect)
  // Always show the preview pane: fall back to classic when no
  // resolved style is passed (variant=default). Mirrors ColorPicker.
  const previewStyle =
    resolvedStyle ?? findTextStyle('classic', []) ?? null
  const showPreview = !!previewStyle

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={cn(
          'grid max-h-[92vh] w-full gap-0 overflow-hidden p-0',
          showPreview
            ? 'max-w-5xl grid-rows-[auto_1fr_auto]'
            : 'max-w-3xl grid-rows-[auto_1fr_auto]'
        )}
      >
        <div className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Type className="size-5" />
            Pick a font
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Override the typeface for this segment without forking the whole text
            style. The renderer prefers segment / variant overrides before the
            style&apos;s own font.
          </DialogDescription>
        </div>

        <div
          className="grid min-h-0 overflow-hidden"
          style={
            showPreview
              ? { gridTemplateColumns: `${split.left} ${split.right}` }
              : undefined
          }
        >
          {/* LEFT — font grid */}
          <div className="overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-2">
              {ALLOWED_FONT_IDS.map((id) => (
                <FontCard
                  key={id}
                  fontId={id}
                  selected={picked === id}
                  onSelect={() => setPicked(id)}
                  sampleText={
                    sampleText.length > 60
                      ? sampleText.slice(0, 58) + '…'
                      : sampleText
                  }
                />
              ))}
            </div>
          </div>

          {/* RIGHT — device mockup preview */}
          {showPreview ? (
            <div className="flex min-h-0 items-center justify-center overflow-y-auto border-l bg-secondary/20 p-4">
              <DeviceMockupPreview
                aspect={previewAspect}
                background={previewBackground}
                maxWidth={300}
                label={
                  resolvedStyle
                    ? picked
                      ? `${FONT_LABEL[picked] ?? picked}`
                      : 'Live preview'
                    : 'Live preview · classic fallback'
                }
              >
                <FontPreviewText
                  style={previewStyle!}
                  fontId={picked}
                  text={
                    sampleText.length > 64
                      ? sampleText.slice(0, 60) + '…'
                      : sampleText
                  }
                />
              </DeviceMockupPreview>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2 border-t px-4 py-3 sm:flex-wrap sm:space-x-0">
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

/**
 * Renders the headline at the resolved style's typography, swapping
 * just the fontFamily for what the user has picked (or the style's
 * own fontFamily when nothing is picked yet). Mirrors how the
 * renderer applies a font override at composite time.
 */
function FontPreviewText({
  style,
  fontId,
  text,
}: {
  style: TextStyle
  fontId: string | null
  text: string
}) {
  const effective: TextStyle = {
    ...style,
    fontFamily: fontId ?? style.fontFamily,
  }
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8%',
        pointerEvents: 'none',
      }}
    >
      <div style={libPlateCss(effective)}>
        <span style={libTextCss(effective)}>{text}</span>
      </div>
    </div>
  )
}
