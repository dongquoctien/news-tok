'use client'

import { useEffect, useMemo, useState } from 'react'
import { Palette, X } from 'lucide-react'
import type {
  Aspect,
  ColorOverride,
  TextStyle,
} from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  plateCss as libPlateCss,
  textCss as libTextCss,
} from '@/lib/text-style-preview'
import { DeviceMockupPreview, splitRatioFor } from './device-mockup-preview'

/**
 * Curated accent palette — 12 swatches matching the topic-flavoured
 * presets the orchestrator already reaches for. Users can click one to
 * fill the active channel, or type a custom hex below.
 */
const SWATCHES: Array<{ id: string; hex: string; label: string }> = [
  { id: 'white', hex: '#ffffff', label: 'White' },
  { id: 'yellow', hex: '#fde047', label: 'Hormozi yellow' },
  { id: 'red', hex: '#ef4444', label: 'Breaking red' },
  { id: 'cyan', hex: '#67e8f9', label: 'Tech cyan' },
  { id: 'green', hex: '#22ff67', label: 'Saturated green' },
  { id: 'mint', hex: '#34d399', label: 'Wellness mint' },
  { id: 'pink', hex: '#f472b6', label: 'Neon pink' },
  { id: 'orange', hex: '#ea580c', label: 'Lifestyle orange' },
  { id: 'gold', hex: '#fbbf24', label: 'Finance gold' },
  { id: 'purple', hex: '#a78bfa', label: 'Editorial purple' },
  { id: 'black', hex: '#0b0b0f', label: 'Pure black' },
  { id: 'dimmed', hex: 'rgba(255,255,255,0.4)', label: 'Dimmed white' },
]

type Channel = 'primary' | 'accent' | 'stroke' | 'idle'

const CHANNEL_META: Record<
  Channel,
  { label: string; hint: string }
> = {
  primary: {
    label: 'Primary',
    hint: 'Main body text fill — used for everything except active karaoke words.',
  },
  accent: {
    label: 'Accent',
    hint: 'Active karaoke word, or the highlight chip color.',
  },
  stroke: {
    label: 'Stroke',
    hint: 'Outline color around glyphs. Width is fixed by the style preset.',
  },
  idle: {
    label: 'Idle',
    hint: 'Not-yet-spoken karaoke words (e.g. dimmed white).',
  },
}

function Swatch({
  hex,
  selected,
  onSelect,
  title,
}: {
  hex: string
  selected: boolean
  onSelect: () => void
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      className={cn(
        'group relative size-8 shrink-0 rounded-md border transition-all',
        selected
          ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
          : 'border-border/60 hover:scale-110'
      )}
      style={{ background: hex }}
    />
  )
}

function ChannelRow({
  channel,
  value,
  onChange,
}: {
  channel: Channel
  value: string | undefined
  onChange: (next: string | undefined) => void
}) {
  const meta = CHANNEL_META[channel]
  const enabled = value !== undefined
  return (
    <div className="flex h-full flex-col rounded-md border bg-secondary/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Label className="text-sm">{meta.label}</Label>
          {/* min-h pins the hint block to two lines so the action below
              lands at the same y across all four channel cards, even
              when one hint is shorter than the others. */}
          <p className="mt-0.5 min-h-[2.5rem] text-[10px] leading-snug text-muted-foreground">
            {meta.hint}
          </p>
        </div>
        {enabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            onClick={() => onChange(undefined)}
            title="Reset to style default"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {enabled ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SWATCHES.map((s) => (
              <Swatch
                key={s.id}
                hex={s.hex}
                selected={value === s.hex}
                onSelect={() => onChange(s.hex)}
                title={s.label}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="size-6 shrink-0 rounded border"
              style={{ background: value }}
              aria-hidden
            />
            <Input
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="#hex or rgba(...)"
              className="h-7 font-mono text-xs"
            />
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          // mt-auto pushes the action to the bottom of the flex column
          // so disabled-state cards align with whatever's below in the
          // active-state cards (swatch grid + hex input).
          className="mt-auto w-full"
          onClick={() => onChange(SWATCHES[0]!.hex)}
        >
          Override this channel
        </Button>
      )}
    </div>
  )
}

export type ColorPickerProps = {
  /** Current value to seed the dialog (variant > segment merged). */
  current?: ColorOverride
  /**
   * When set, the picker shows a "This segment in variant X only" option as
   * the safest default so color edits do not leak across variants.
   */
  activeVariantId?: string | null
  onApply: (input: {
    colorOverride: ColorOverride
    scope: 'segmentInVariant' | 'segment' | 'all'
  }) => void
  trigger: React.ReactNode
  /** Resolved style for this segment (variant > segment > scene default).
   *  Drives the right-pane preview so users see the colour overrides
   *  layered onto the real typography + plate. Omit to fall back to a
   *  plain text preview. */
  resolvedStyle?: TextStyle | null
  /** Sample text rendered in the preview — usually the segment headline. */
  sampleText?: string
  /** Project aspect — drives the device frame (phone / laptop / square). */
  aspect?: Aspect
  /** Optional segment background image path. Drawn under the text so
   *  light-on-dark overrides look the same as the final render. */
  previewBackground?: string
}

export function ColorPicker({
  current,
  activeVariantId,
  onApply,
  trigger,
  resolvedStyle,
  sampleText,
  aspect,
  previewBackground,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ColorOverride>(current ?? {})

  useEffect(() => {
    if (open) setDraft(current ?? {})
  }, [open, current])

  const hasAny = useMemo(
    () => Object.values(draft).some((v) => typeof v === 'string' && v.length > 0),
    [draft]
  )

  const setField = (channel: Channel, value: string | undefined) => {
    setDraft((d) => {
      const next = { ...d }
      if (value === undefined) {
        delete next[channel]
      } else {
        next[channel] = value
      }
      return next
    })
  }

  const apply = (scope: 'segmentInVariant' | 'segment' | 'all') => {
    onApply({ colorOverride: draft, scope })
    setOpen(false)
  }

  const previewAspect = aspect ?? '9:16'
  const split = splitRatioFor(previewAspect)
  // Right pane is only useful when the caller actually passed a style
  // to preview against — without it we'd just be rendering colour
  // chips on a grey card, which the left pane already does.
  const showPreview = !!resolvedStyle

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={cn(
          'grid max-h-[92vh] w-full gap-0 overflow-hidden p-0',
          showPreview
            ? 'max-w-5xl grid-rows-[auto_1fr_auto]'
            : 'max-w-2xl grid-rows-[auto_1fr_auto]'
        )}
      >
        <div className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Palette className="size-5" />
            Customise colours
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Override one or more colour channels for this segment without forking
            the text style. Leave a channel off to keep the preset's value.
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
          {/* LEFT — channel form */}
          <div className="overflow-y-auto p-4">
            <div className="grid auto-rows-fr grid-cols-2 gap-3">
              {(['primary', 'accent', 'stroke', 'idle'] as const).map((c) => (
                <ChannelRow
                  key={c}
                  channel={c}
                  value={draft[c]}
                  onChange={(v) => setField(c, v)}
                />
              ))}
            </div>
          </div>

          {/* RIGHT — device mockup preview, only when a style was provided */}
          {showPreview ? (
            <div className="flex min-h-0 items-center justify-center overflow-y-auto border-l bg-secondary/20 p-4">
              <DeviceMockupPreview
                aspect={previewAspect}
                background={previewBackground}
                maxWidth={300}
                label="Live preview"
              >
                <ColorPreviewText
                  style={resolvedStyle!}
                  override={draft}
                  text={
                    (sampleText && sampleText.length > 64
                      ? sampleText.slice(0, 60) + '…'
                      : sampleText) || 'Aa Đêm khuya'
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
              disabled={!hasAny}
              onClick={() => apply('segmentInVariant')}
              title={`Pin colours to this segment in variant ${activeVariantId} only`}
            >
              Segment · variant {activeVariantId}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={!hasAny}
            onClick={() => apply('segment')}
            title="Apply colours to this segment across every variant"
          >
            Segment · all variants
          </Button>
          <Button
            variant="outline"
            disabled={!hasAny}
            onClick={() => apply('all')}
            title="Apply colours to every segment in the project"
          >
            All segments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Renders the preview headline using the resolved style, with the
 * draft colour overrides layered on top. Mirrors how the renderer
 * picks colours: override > style.color / style.textStroke.color etc.
 *
 * Sized for a 300px-wide device frame — we scale fontSize down from
 * the logical 1080px canvas via libTextCss's default `scale=3.5`.
 */
function ColorPreviewText({
  style,
  override,
  text,
}: {
  style: TextStyle
  override: ColorOverride
  text: string
}) {
  // Clone the style and apply overrides so libTextCss naturally
  // renders with the new fills / stroke colour. When the style has no
  // textStroke and the user adds a stroke colour override, synthesize
  // a minimal stroke (3px outside) so the override is visible in the
  // preview — matches the renderer's behaviour of treating an
  // override on a missing channel as "enable it".
  const effective: TextStyle = {
    ...style,
    color: override.primary ?? style.color,
    textStroke: override.stroke
      ? {
          color: override.stroke,
          widthPx: style.textStroke?.widthPx ?? 3,
          side: style.textStroke?.side ?? 'outside',
        }
      : style.textStroke,
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
