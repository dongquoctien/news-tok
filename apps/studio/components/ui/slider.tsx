'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Minimal range slider built on `<input type="range">`. We don't pull
 * in @radix-ui/react-slider because the editor only needs simple
 * single-value sliders with a numeric badge, and the native control
 * gives us keyboard support, accessibility, and touch-drag for free.
 *
 * Usage matches the shadcn Slider API as closely as possible (value
 * as an array of one number, onValueChange callback) so it can be
 * swapped out later without touching call sites.
 */
export type SliderProps = {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  /** Optional label rendered next to the slider. */
  label?: React.ReactNode
  /** Optional value formatter; defaults to the raw number. */
  formatValue?: (v: number) => string
  /** Optional reset-to-default button shown when value !== resetTo. */
  resetTo?: number
  className?: string
  ariaLabel?: string
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  formatValue,
  resetTo,
  className,
  ariaLabel,
}: SliderProps) {
  const display = formatValue ? formatValue(value) : String(value)
  const showReset = resetTo !== undefined && value !== resetTo
  return (
    <div className={cn('space-y-1', className)}>
      {label || resetTo !== undefined ? (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">{label}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="tabular-nums text-foreground">{display}</span>
            {showReset ? (
              <button
                type="button"
                onClick={() => onChange(resetTo!)}
                className="rounded px-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                title="Reset to default"
              >
                reset
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        aria-label={ariaLabel}
        className={cn(
          'block h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary',
          // WebKit thumb
          '[&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:h-3.5',
          '[&::-webkit-slider-thumb]:w-3.5',
          '[&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-primary',
          '[&::-webkit-slider-thumb]:border-0',
          '[&::-webkit-slider-thumb]:shadow',
          // Firefox thumb
          '[&::-moz-range-thumb]:h-3.5',
          '[&::-moz-range-thumb]:w-3.5',
          '[&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-primary',
          '[&::-moz-range-thumb]:border-0',
          '[&::-moz-range-thumb]:shadow'
        )}
      />
    </div>
  )
}
