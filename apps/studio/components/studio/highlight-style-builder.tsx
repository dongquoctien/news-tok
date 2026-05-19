'use client'

import { useMemo } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { HighlightStyle } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ColorSwatchField } from '@/components/studio/color-swatch-field'

/**
 * Inline builder for `segment.highlightStyle` — the style applied to
 * any phrase wrapped in `**...**` inside the narration text. This is
 * the only place a user touches `HighlightStyle` directly; everything
 * else (paste-clipboard, validation) reads what this writes.
 *
 * UX choices:
 *   - The block self-hides when the segment text has no `**...**`
 *     markers so it never adds noise to plain headlines. Instead we
 *     show a one-line hint pointing the user at the syntax.
 *   - 4 controls only: bgStyle, color, bgColor, fontWeight/italic.
 *     paddingPct + radiusPx are kept on the schema for advanced
 *     copy/paste but Studio uses the defaults — exposing them was
 *     never asked for and a tiny preview can't show the difference.
 *   - The live preview is a one-line chip with the highlighted text
 *     inline so the user can spot a contrast / weight problem
 *     immediately, without having to flip back to the storyboard.
 */

const BG_STYLE_OPTIONS: Array<{ id: HighlightStyle['bgStyle']; label: string; hint: string }> = [
  { id: 'plate', label: 'Plate', hint: 'Solid rounded rectangle behind the phrase.' },
  { id: 'underline', label: 'Underline', hint: 'Coloured line beneath the phrase.' },
  { id: 'glow', label: 'Glow', hint: 'Soft halo around the phrase.' },
  { id: 'none', label: 'Text only', hint: 'Only change the colour / weight / italic.' },
]

const WEIGHT_OPTIONS: Array<{ value: number | 'inherit'; label: string }> = [
  { value: 'inherit', label: 'Inherit' },
  { value: 400, label: '400 · Regular' },
  { value: 600, label: '600 · Semibold' },
  { value: 800, label: '800 · Extra bold' },
  { value: 900, label: '900 · Black' },
]

/** Default value when the user enables highlight for the first time. */
const DEFAULT_HIGHLIGHT: HighlightStyle = {
  bgStyle: 'plate',
  color: '#ffffff',
  bgColor: '#dc2626',
  italic: false,
  paddingPct: 4,
  radiusPx: 8,
}

/** Pull the first `**phrase**` out of a text — used by the preview so
 *  the user sees the actual word they marked, not a generic placeholder. */
function firstHighlightedPhrase(text: string): string | null {
  const m = /\*\*([^*]+)\*\*/.exec(text)
  return m ? m[1]! : null
}

function hasMarkers(text: string): boolean {
  return /\*\*[^*]+\*\*/.test(text)
}

export function HighlightStyleBuilder({
  segmentText,
  value,
  onChange,
}: {
  /** Current segment text — used to detect markers + drive the preview. */
  segmentText: string
  /** Current style, or undefined when the user hasn't enabled it. */
  value: HighlightStyle | undefined
  /** Receives `undefined` when the user clears the style entirely. */
  onChange: (next: HighlightStyle | undefined) => void
}) {
  const enabled = value !== undefined
  const hasAnyMarker = useMemo(() => hasMarkers(segmentText), [segmentText])
  const phrase = useMemo(
    () => firstHighlightedPhrase(segmentText) ?? 'từ khóa',
    [segmentText]
  )

  const patch = (next: Partial<HighlightStyle>) => {
    onChange({ ...(value ?? DEFAULT_HIGHLIGHT), ...next })
  }

  return (
    <div className="rounded-md border bg-secondary/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Label className="flex items-center gap-1.5 text-sm">
            <Sparkles className="size-3.5" />
            Highlight cho **từ khóa**
          </Label>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            Bọc một cụm trong narration bằng <code className="rounded bg-muted px-1">**...**</code> để
            đoạn đó được tô nổi bật trên headline. Không ảnh hưởng đến phụ đề
            karaoke.
          </p>
        </div>
        {enabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            onClick={() => onChange(undefined)}
            title="Xoá highlight style — dùng mặc định của layout"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {!hasAnyMarker ? (
        <p className="mt-3 rounded border border-dashed bg-background/50 px-2 py-1.5 text-[10px] text-muted-foreground">
          Đoạn segment hiện chưa có cặp <code className="rounded bg-muted px-1">**...**</code>.
          Sửa ô <strong>Text</strong> phía trên và bọc cụm bạn muốn nổi bật rồi quay lại đây.
        </p>
      ) : !enabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => onChange(DEFAULT_HIGHLIGHT)}
        >
          Bật highlight cho cụm <strong className="mx-1">{phrase}</strong>
        </Button>
      ) : (
        <div className="mt-3 grid gap-3">
          {/* Live preview chip — shows the real word with the real style. */}
          <PreviewChip phrase={phrase} highlight={value!} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Kiểu nền</Label>
              <Select
                value={value!.bgStyle}
                onValueChange={(v) => patch({ bgStyle: v as HighlightStyle['bgStyle'] })}
              >
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BG_STYLE_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {BG_STYLE_OPTIONS.find((o) => o.id === value!.bgStyle)?.hint}
              </p>
            </div>
            <div>
              <Label className="text-xs">Độ đậm</Label>
              <Select
                value={value!.fontWeight == null ? 'inherit' : String(value!.fontWeight)}
                onValueChange={(v) =>
                  patch({ fontWeight: v === 'inherit' ? undefined : Number(v) })
                }
              >
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHT_OPTIONS.map((o) => (
                    <SelectItem key={String(o.value)} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="mt-1.5 flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={value!.italic ?? false}
                  onChange={(e) => patch({ italic: e.target.checked })}
                />
                In nghiêng
              </label>
            </div>
          </div>

          <ColorSwatchField
            label="Màu chữ"
            value={value!.color}
            onChange={(v) => patch({ color: v })}
          />
          {value!.bgStyle !== 'none' ? (
            <ColorSwatchField
              label={value!.bgStyle === 'plate' ? 'Màu nền' : 'Màu hiệu ứng'}
              value={value!.bgColor}
              onChange={(v) => patch({ bgColor: v })}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * One-line preview that mirrors the renderer's `highlightCss` so the
 * user sees a faithful approximation before committing. Kept inline
 * (no canvas, no Player) because for a single phrase chip the CSS
 * snapshot reads identically.
 */
function PreviewChip({ phrase, highlight }: { phrase: string; highlight: HighlightStyle }) {
  const css: React.CSSProperties = {
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  }
  if (highlight.color) css.color = highlight.color
  if (highlight.fontWeight != null) css.fontWeight = highlight.fontWeight
  if (highlight.italic) css.fontStyle = 'italic'
  switch (highlight.bgStyle) {
    case 'plate':
      if (highlight.bgColor) css.background = highlight.bgColor
      css.padding = '2px 8px'
      css.borderRadius = Math.min(highlight.radiusPx, 12)
      break
    case 'underline':
      css.textDecoration = 'underline'
      css.textDecorationColor = highlight.bgColor ?? highlight.color ?? 'currentColor'
      css.textDecorationThickness = '2px'
      css.textUnderlineOffset = '3px'
      break
    case 'glow': {
      const halo = highlight.bgColor ?? highlight.color ?? '#fde047'
      css.textShadow = `0 0 6px ${halo}, 0 0 14px ${halo}`
      break
    }
    case 'none':
      break
  }
  return (
    <div className="rounded border bg-background px-3 py-2 text-sm">
      <span className="text-muted-foreground">Tiêu đề mẫu </span>
      <span style={css}>{phrase}</span>
      <span className="text-muted-foreground"> sẽ trông như vậy.</span>
    </div>
  )
}
