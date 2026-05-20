'use client'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Curated studio brand palette — single source of truth shared by
 * the highlight-style builder (per-`**phrase**` color) and the full
 * 4-channel ColorPicker dialog (TextStyle overrides). Names appear
 * as tooltips so users can tell "Hormozi yellow" from "Finance
 * gold" without sampling the hex. Add new colors here once and
 * both pickers update.
 */
export const STUDIO_SWATCHES: Array<{ id: string; hex: string; label: string }> = [
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

type Size = 'compact' | 'roomy'

export type ColorSwatchFieldProps = {
  value: string | undefined
  onChange: (next: string | undefined) => void
  /** Optional label rendered above the swatch row. */
  label?: string
  /** Visual density. `compact` = highlight-builder shape (size-6 swatches,
   *  h-7 hex input, no live-color dot). `roomy` = color-picker dialog
   *  shape (size-8 swatches, default hex input height, live-color dot
   *  beside the hex input). Default `compact`. */
  size?: Size
  /** Placeholder text inside the hex input. Default `'#hex'`. */
  hexPlaceholder?: string
}

/**
 * Swatch grid + hex input. Replaces the two private `ColorRow`/`Swatch`
 * implementations that used to live in highlight-style-builder.tsx
 * and color-picker.tsx. Selection state, ring color, hover scale are
 * identical to the previous two implementations so the rewire is a
 * pixel-equivalent swap for both call sites.
 */
export function ColorSwatchField({
  value,
  onChange,
  label,
  size = 'compact',
  hexPlaceholder = '#hex',
}: ColorSwatchFieldProps) {
  const swatchSize = size === 'roomy' ? 'size-8' : 'size-6'
  const inputClasses =
    size === 'roomy' ? 'h-9 font-mono text-xs' : 'h-7 font-mono text-xs'

  return (
    <div>
      {label ? <Label className="text-xs">{label}</Label> : null}
      <div className={cn('flex flex-wrap items-center gap-1.5', label && 'mt-1')}>
        {STUDIO_SWATCHES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.hex)}
            title={s.label}
            className={cn(
              'shrink-0 rounded border transition-all',
              swatchSize,
              value === s.hex
                ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
                : 'border-border/60 hover:scale-110'
            )}
            style={{ background: s.hex }}
          />
        ))}
      </div>
      <div className={cn('flex items-center gap-2', size === 'roomy' ? 'mt-2' : 'mt-1.5')}>
        {size === 'roomy' ? (
          <span
            className="size-6 shrink-0 rounded border"
            style={{ background: value ?? 'transparent' }}
            aria-hidden
          />
        ) : null}
        <Input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={hexPlaceholder}
          className={cn(inputClasses, size === 'compact' && 'w-32')}
        />
      </div>
    </div>
  )
}
