'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2, Plus, Type } from 'lucide-react'
import {
  ALLOWED_FONT_IDS,
  type AllowedFontId,
} from '@news-tok/shared/text-styles'
import type { TextMotion, TextStyle } from '@news-tok/shared/schema'
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
import { Label } from '@/components/ui/label'
import { fontLabel } from '@/lib/font-label'
import { plateCss, previewFontStack, textCss } from '@/lib/text-style-preview'
import { cn } from '@/lib/utils'

/** Family options mirror the schema enum. */
const FAMILIES: { id: TextStyle['family']; label: string }[] = [
  { id: 'news', label: 'News' },
  { id: 'social', label: 'Social' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'retro', label: 'Retro' },
  { id: 'playful', label: 'Playful' },
]

const ALIGNS: TextStyle['align'][] = ['left', 'center', 'right']
const ANCHORS: TextStyle['anchor'][] = ['top', 'middle', 'bottom']

/** Subset of motions exposed in the builder. Power users can hand-edit
 * storyboard.json to reach the rest (glitch / waveBounce / etc.). */
const ENTER_MOTIONS: TextMotion[] = [
  'none',
  'fade',
  'slideUp',
  'slideDown',
  'scaleIn',
  'typewriter',
  'wordPop',
  'wordHighlight',
  'karaoke',
  'letterStagger',
]

const EXIT_MOTIONS: TextStyle['exit'][] = ['fade', 'slideDown', 'none']

const KARAOKE_MODES: NonNullable<TextStyle['karaokeMode']>[] = ['fill', 'pop', 'underline']

/** Default draft used when the user hits "Create new". Picks a sane
 * starting point so the live preview renders something the moment the
 * dialog opens. */
function emptyDraft(language: 'vi' | 'en'): TextStyle {
  return {
    id: `user-${Date.now().toString(36)}`,
    name: 'My style',
    family: 'social',
    fontFamily: language === 'vi' ? 'beVietnamPro' : 'inter',
    fontSize: 84,
    fontWeight: 700,
    letterSpacing: 0,
    lineHeight: 1.15,
    color: '#ffffff',
    background: { kind: 'none' },
    align: 'center',
    anchor: 'bottom',
    marginPct: 8,
    enter: 'fade',
    exit: 'fade',
    enterDurationSec: 0.4,
    exitDurationSec: 0.4,
    source: 'user',
    scope: [],
  }
}

/**
 * Slugify a user-provided name into a deterministic id suffix so two
 * styles with the same name can't collide. Result is always prefixed
 * `user-` to keep it out of the built-in namespace.
 */
function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'style'
  )
}

export type TextStyleBuilderProps = {
  projectId: string
  /** Pass the style to edit, or `null` to start a fresh draft. */
  initial: TextStyle | null
  language: 'vi' | 'en'
  /** Called after a successful POST so the parent can refresh. */
  onSaved: (style: TextStyle) => void
  trigger: React.ReactNode
}

/**
 * Descript-style accordion dialog for authoring a user TextStyle.
 *
 * Five sections (Identity, Typography, Layout, Decorators, Motion);
 * Identity stays open by default, the rest collapse so the form fits
 * a single dialog without scrolling on common viewports.
 *
 * Live preview at the top stays in sync with the draft via direct
 * styled DOM (no Player round-trip) — that's both faster than mounting
 * `<Player>` in the dialog and avoids re-bundling Remotion every
 * keystroke.
 */
export function TextStyleBuilder({
  projectId,
  initial,
  language,
  onSaved,
  trigger,
}: TextStyleBuilderProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<TextStyle>(() => initial ?? emptyDraft(language))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!initial

  useEffect(() => {
    if (!open) return
    setDraft(initial ?? emptyDraft(language))
    setError(null)
  }, [open, initial, language])

  // When the user retypes the name on a brand-new draft, re-derive the
  // id so the storage key matches what the user typed. Skip this for
  // edits — the user might rename a style and we mustn't break refs
  // already pointing at the old id.
  const onName = (name: string) => {
    setDraft((d) => {
      const nextId = isEdit ? d.id : `user-${slugify(name)}-${Date.now().toString(36).slice(-4)}`
      return { ...d, name, ...(isEdit ? {} : { id: nextId }) }
    })
  }

  const patch = (p: Partial<TextStyle>) => setDraft((d) => ({ ...d, ...p }))

  const save = async () => {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/text-styles`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ style: draft }),
        }
      )
      const body = (await res.json()) as { style?: TextStyle; error?: string }
      if (!res.ok || !body.style) {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      onSaved(body.style)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="size-5" />
            {isEdit ? 'Edit text style' : 'Create text style'}
          </DialogTitle>
          <DialogDescription>
            All knobs preview live above. The id is generated from the
            name when creating; existing ids are preserved when editing
            so segments still resolve.
          </DialogDescription>
        </DialogHeader>

        <Preview draft={draft} />

        <div className="space-y-2">
          <Section title="Identity" defaultOpen>
            <IdentitySection draft={draft} onName={onName} onPatch={patch} />
          </Section>
          <Section title="Typography">
            <TypographySection draft={draft} onPatch={patch} />
          </Section>
          <Section title="Layout">
            <LayoutSection draft={draft} onPatch={patch} />
          </Section>
          <Section title="Decorators">
            <DecoratorsSection draft={draft} onPatch={patch} />
          </Section>
          <Section title="Motion">
            <MotionSection draft={draft} onPatch={patch} />
          </Section>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            Id: <code className="font-mono">{draft.id}</code>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !draft.name.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              {isEdit ? 'Update' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Preview({ draft }: { draft: TextStyle }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-md border bg-secondary/20 px-4">
      <div style={plateCss(draft)}>
        <span style={textCss(draft, 4)}>
          {draft.name || 'Live preview'}
        </span>
      </div>
    </div>
  )
}

function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [openState, setOpenState] = useState(!!defaultOpen)
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpenState((s) => !s)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn('size-4 transition-transform', openState && 'rotate-180')}
        />
      </button>
      {openState ? (
        <div className="space-y-3 border-t px-3 py-3">{children}</div>
      ) : null}
    </div>
  )
}

function IdentitySection({
  draft,
  onName,
  onPatch,
}: {
  draft: TextStyle
  onName: (name: string) => void
  onPatch: (p: Partial<TextStyle>) => void
}) {
  return (
    <>
      <Field label="Name">
        <input
          type="text"
          value={draft.name}
          maxLength={40}
          onChange={(e) => onName(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </Field>
      <Field label="Family">
        <div className="flex flex-wrap gap-1">
          {FAMILIES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPatch({ family: f.id })}
              className={cn(
                'rounded-md border px-3 py-1 text-xs uppercase tracking-wide transition-colors',
                f.id === draft.family
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Field>
    </>
  )
}

function TypographySection({
  draft,
  onPatch,
}: {
  draft: TextStyle
  onPatch: (p: Partial<TextStyle>) => void
}) {
  return (
    <>
      <Field label="Font">
        <select
          value={draft.fontFamily}
          onChange={(e) => onPatch({ fontFamily: e.target.value })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:light_dark]"
        >
          {ALLOWED_FONT_IDS.map((id) => (
            <option
              key={id}
              value={id}
              className="bg-background text-foreground"
              style={{ fontFamily: previewFontStack(id) }}
            >
              {fontLabel(id)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Slider
          label="Size"
          min={12}
          max={200}
          step={2}
          value={draft.fontSize}
          unit="px"
          onChange={(v) => onPatch({ fontSize: v })}
        />
        <Slider
          label="Weight"
          min={300}
          max={900}
          step={100}
          value={draft.fontWeight}
          onChange={(v) => onPatch({ fontWeight: v })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Slider
          label="Letter spacing"
          min={-2}
          max={8}
          step={0.5}
          value={draft.letterSpacing}
          onChange={(v) => onPatch({ letterSpacing: v })}
        />
        <Slider
          label="Line height"
          min={0.9}
          max={1.8}
          step={0.05}
          value={draft.lineHeight}
          onChange={(v) => onPatch({ lineHeight: v })}
        />
      </div>
      <Field label="Colour">
        <ColorInput
          value={draft.color}
          onChange={(c) => onPatch({ color: c })}
        />
      </Field>
    </>
  )
}

function LayoutSection({
  draft,
  onPatch,
}: {
  draft: TextStyle
  onPatch: (p: Partial<TextStyle>) => void
}) {
  return (
    <>
      <Field label="Align">
        <Radio
          value={draft.align}
          options={ALIGNS}
          onChange={(v) => onPatch({ align: v as TextStyle['align'] })}
        />
      </Field>
      <Field label="Anchor">
        <Radio
          value={draft.anchor}
          options={ANCHORS}
          onChange={(v) => onPatch({ anchor: v as TextStyle['anchor'] })}
        />
      </Field>
      <Slider
        label="Margin (% of canvas)"
        min={0}
        max={40}
        step={1}
        value={draft.marginPct}
        unit="%"
        onChange={(v) => onPatch({ marginPct: v })}
      />
    </>
  )
}

function DecoratorsSection({
  draft,
  onPatch,
}: {
  draft: TextStyle
  onPatch: (p: Partial<TextStyle>) => void
}) {
  const bg = draft.background
  return (
    <>
      <Field label="Background plate">
        <Radio
          value={bg.kind}
          options={['none', 'solid', 'gradient']}
          onChange={(kind) => {
            if (kind === 'none') onPatch({ background: { kind: 'none' } })
            else if (kind === 'solid')
              onPatch({
                background: {
                  kind: 'solid',
                  color: '#000000',
                  paddingPct: 2,
                  radiusPx: 8,
                  opacity: 1,
                },
              })
            else
              onPatch({
                background: {
                  kind: 'gradient',
                  from: '#000000',
                  to: '#333333',
                  angleDeg: 180,
                  paddingPct: 2,
                  radiusPx: 8,
                },
              })
          }}
        />
      </Field>
      {bg.kind === 'solid' ? (
        <>
          <Field label="Plate colour">
            <ColorInput value={bg.color} onChange={(c) => onPatch({ background: { ...bg, color: c } })} />
          </Field>
          <Slider
            label="Plate opacity"
            min={0}
            max={1}
            step={0.05}
            value={bg.opacity}
            onChange={(v) => onPatch({ background: { ...bg, opacity: v } })}
          />
        </>
      ) : null}
      {bg.kind === 'gradient' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <ColorInput value={bg.from} onChange={(c) => onPatch({ background: { ...bg, from: c } })} />
          </Field>
          <Field label="To">
            <ColorInput value={bg.to} onChange={(c) => onPatch({ background: { ...bg, to: c } })} />
          </Field>
        </div>
      ) : null}

      <Field label="Text stroke">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!draft.textStroke}
            onChange={(e) =>
              onPatch(
                e.target.checked
                  ? { textStroke: { widthPx: 4, color: '#000000' } }
                  : { textStroke: undefined }
              )
            }
            className="size-3.5 cursor-pointer accent-primary"
          />
          Outline the text
        </label>
        {draft.textStroke ? (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Slider
              label="Width"
              min={1}
              max={12}
              step={1}
              value={draft.textStroke.widthPx}
              unit="px"
              onChange={(v) =>
                onPatch({ textStroke: { ...draft.textStroke!, widthPx: v } })
              }
            />
            <Field label="Stroke colour">
              <ColorInput
                value={draft.textStroke.color}
                onChange={(c) =>
                  onPatch({ textStroke: { ...draft.textStroke!, color: c } })
                }
              />
            </Field>
          </div>
        ) : null}
      </Field>

      <Field label="Text shadow">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!draft.textShadow}
            onChange={(e) =>
              onPatch(
                e.target.checked
                  ? {
                      textShadow: {
                        blur: 6,
                        color: 'rgba(0,0,0,0.5)',
                        offsetX: 0,
                        offsetY: 2,
                      },
                    }
                  : { textShadow: undefined }
              )
            }
            className="size-3.5 cursor-pointer accent-primary"
          />
          Drop shadow behind the text
        </label>
        {draft.textShadow ? (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Slider
              label="Blur"
              min={0}
              max={20}
              step={1}
              value={draft.textShadow.blur}
              unit="px"
              onChange={(v) =>
                onPatch({ textShadow: { ...draft.textShadow!, blur: v } })
              }
            />
            <Field label="Shadow colour">
              <ColorInput
                value={draft.textShadow.color}
                onChange={(c) =>
                  onPatch({ textShadow: { ...draft.textShadow!, color: c } })
                }
              />
            </Field>
          </div>
        ) : null}
      </Field>
    </>
  )
}

function MotionSection({
  draft,
  onPatch,
}: {
  draft: TextStyle
  onPatch: (p: Partial<TextStyle>) => void
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Enter">
          <select
            value={draft.enter}
            onChange={(e) => onPatch({ enter: e.target.value as TextMotion })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:light_dark]"
          >
            {ENTER_MOTIONS.map((m) => (
              <option key={m} value={m} className="bg-background text-foreground">
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Exit">
          <select
            value={draft.exit}
            onChange={(e) => onPatch({ exit: e.target.value as TextStyle['exit'] })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:light_dark]"
          >
            {EXIT_MOTIONS.map((m) => (
              <option key={m} value={m} className="bg-background text-foreground">
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Slider
          label="Enter duration"
          min={0.1}
          max={2}
          step={0.1}
          value={draft.enterDurationSec}
          unit="s"
          onChange={(v) => onPatch({ enterDurationSec: v })}
        />
        <Slider
          label="Exit duration"
          min={0.1}
          max={2}
          step={0.1}
          value={draft.exitDurationSec}
          unit="s"
          onChange={(v) => onPatch({ exitDurationSec: v })}
        />
      </div>

      {draft.enter === 'karaoke' ? (
        <div className="space-y-2 rounded-md border bg-secondary/20 p-3">
          <Field label="Karaoke mode">
            <Radio
              value={draft.karaokeMode ?? 'fill'}
              options={KARAOKE_MODES}
              onChange={(v) =>
                onPatch({ karaokeMode: v as NonNullable<TextStyle['karaokeMode']> })
              }
            />
          </Field>
          <Field label="Accent colour (active word)">
            <ColorInput
              value={draft.karaokeAccentColor ?? draft.color}
              onChange={(c) => onPatch({ karaokeAccentColor: c })}
            />
          </Field>
        </div>
      ) : null}

      {draft.enter === 'letterStagger' ? (
        <Slider
          label="Stagger step"
          min={0.01}
          max={0.2}
          step={0.01}
          value={draft.staggerStep ?? 0.04}
          unit="s"
          onChange={(v) => onPatch({ staggerStep: v })}
        />
      ) : null}
    </>
  )
}

// --- Small reusable form bits -------------------------------------------

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  )
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  unit,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  unit?: string
  onChange: (v: number) => void
}) {
  // Round display so users don't see 1.2999999. Step controls how many
  // decimals matter; 0.1 → 1 decimal, 0.05 → 2 decimals, etc.
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number.parseFloat(e.target.value))}
          className="h-2 flex-1 cursor-pointer accent-primary"
        />
        <span className="w-14 text-right tabular-nums text-xs text-muted-foreground">
          {value.toFixed(decimals)}
          {unit ? unit : ''}
        </span>
      </div>
    </div>
  )
}

function Radio<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly T[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            'rounded-md border px-3 py-1 text-xs lowercase transition-colors',
            o === value
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:bg-secondary'
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function ColorInput({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value.startsWith('#') ? value : '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}

// Silence the unused-import lint when ALLOWED_FONT_IDS is referenced as type
// rather than value — keep both available without an extra alias.
export type { AllowedFontId }
