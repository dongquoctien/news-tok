'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  Loader2,
  Pipette,
  Plus,
  RotateCcw,
  Sparkles,
  Type,
  X,
} from 'lucide-react'
import {
  BUILT_IN_TEXT_STYLES,
  type AllowedFontId,
} from '@news-tok/shared/text-styles'
import type { TextMotion, TextStyle } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { fontLabel } from '@/lib/font-label'
import { plateCss, previewFontStack, textCss } from '@/lib/text-style-preview'
import { cn } from '@/lib/utils'
import { DeviceMockupPreview, splitRatioFor } from './device-mockup-preview'
import { FontPickerDialog } from './font-picker-dialog'
import type { Aspect } from '@news-tok/shared/schema'

// --- Constants -----------------------------------------------------------

const TABS = ['identity', 'typography', 'layout', 'decorators', 'motion'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  identity: 'Identity',
  typography: 'Typography',
  layout: 'Layout',
  decorators: 'Decorators',
  motion: 'Motion',
}

const FAMILIES: { id: TextStyle['family']; label: string }[] = [
  { id: 'news', label: 'News' },
  { id: 'social', label: 'Social' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'retro', label: 'Retro' },
  { id: 'playful', label: 'Playful' },
]

const ALIGNS: TextStyle['align'][] = ['left', 'center', 'right']
const ANCHORS: TextStyle['anchor'][] = ['top', 'middle', 'bottom']

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

const RECENT_COLORS_KEY = 'news-tok.recent-colors'
const RECENT_COLORS_MAX = 8

// --- Defaults / helpers --------------------------------------------------

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

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'style'
  )
}

/**
 * Clone a built-in style into a user-owned draft. The new draft keeps the
 * preset's typography + decorators + motion but drops the preset id /
 * name so the user has to give it their own label before saving.
 */
function cloneFromPreset(preset: TextStyle, language: 'vi' | 'en'): TextStyle {
  return {
    ...preset,
    id: `user-${slugify(preset.name)}-${Date.now().toString(36).slice(-4)}`,
    name: `${preset.name} (custom)`,
    source: 'user',
    fontFamily: preset.fontFamily ?? (language === 'vi' ? 'beVietnamPro' : 'inter'),
  }
}

// --- Recent colors -------------------------------------------------------

function loadRecentColors(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_COLORS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c): c is string => typeof c === 'string').slice(0, RECENT_COLORS_MAX)
  } catch {
    return []
  }
}

function pushRecentColor(color: string): string[] {
  const current = loadRecentColors()
  // Dedup by case-insensitive value so #FFF and #fff don't double-count.
  const filtered = current.filter((c) => c.toLowerCase() !== color.toLowerCase())
  const next = [color, ...filtered].slice(0, RECENT_COLORS_MAX)
  try {
    window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next))
  } catch {
    // localStorage full or disabled — silently drop. Recent colors are
    // a nice-to-have, not load-bearing.
  }
  return next
}

// --- Component -----------------------------------------------------------

export type TextStyleBuilderProps = {
  projectId: string
  initial: TextStyle | null
  language: 'vi' | 'en'
  /** Project aspect — drives which device frame the right-pane preview
   *  uses (phone for 9:16, laptop for 16:9, square for 1:1). */
  aspect?: Aspect
  /** Optional segment background image path so the live preview renders
   *  over the actual scene instead of an abstract card. */
  previewBackground?: string
  /** Optional sample text — falls back to the draft name. */
  previewText?: string
  onSaved: (style: TextStyle) => void
  trigger: React.ReactNode
}

/**
 * Tabbed sidebar builder for authoring a user TextStyle. Replaces the
 * earlier accordion modal so:
 *   - The active tab is always visible — no scroll-and-expand dance.
 *   - The sheet opens as a right-anchored 440px sidebar so the user can
 *     still see the segment timeline + Player preview while editing.
 *   - The big preview at the top sits over the current segment's
 *     background image, not an abstract grey card.
 *   - Each tab has a reset button so blowing up Decorators doesn't lose
 *     Typography work.
 *   - Identity → "Start from preset" lets users fork a built-in style
 *     instead of starting from a blank `My style` default.
 *   - Motion tab plays a short CSS animation matching the chosen enter
 *     transition so the user sees what they're picking.
 */
export function TextStyleBuilder({
  projectId,
  initial,
  language,
  aspect = '9:16',
  previewBackground,
  previewText,
  onSaved,
  trigger,
}: TextStyleBuilderProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<TextStyle>(() => initial ?? emptyDraft(language))
  const [tab, setTab] = useState<Tab>('typography')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!initial

  // Snapshot of the section state that "Reset" should restore. We freeze
  // it on dialog open so reset always goes back to the moment the user
  // opened the builder, not the latest unsaved state of another section.
  const initialDraft = useMemo(
    () => initial ?? emptyDraft(language),
    [initial, language]
  )

  useEffect(() => {
    if (!open) return
    setDraft(initial ?? emptyDraft(language))
    setTab('typography')
    setError(null)
  }, [open, initial, language])

  const onName = (name: string) => {
    setDraft((d) => {
      const nextId = isEdit ? d.id : `user-${slugify(name)}-${Date.now().toString(36).slice(-4)}`
      return { ...d, name, ...(isEdit ? {} : { id: nextId }) }
    })
  }

  const patch = (p: Partial<TextStyle>) => setDraft((d) => ({ ...d, ...p }))

  /** Restore just one section's fields to the snapshot the dialog opened with. */
  const resetSection = (which: Tab) => {
    setDraft((d) => {
      const base = initialDraft
      switch (which) {
        case 'identity':
          return { ...d, name: base.name, family: base.family, scope: base.scope }
        case 'typography':
          return {
            ...d,
            fontFamily: base.fontFamily,
            fontSize: base.fontSize,
            fontWeight: base.fontWeight,
            letterSpacing: base.letterSpacing,
            lineHeight: base.lineHeight,
            color: base.color,
          }
        case 'layout':
          return {
            ...d,
            align: base.align,
            anchor: base.anchor,
            marginPct: base.marginPct,
          }
        case 'decorators':
          return {
            ...d,
            background: base.background,
            textStroke: base.textStroke,
            textShadow: base.textShadow,
            gradientFill: base.gradientFill,
          }
        case 'motion':
          return {
            ...d,
            enter: base.enter,
            exit: base.exit,
            enterDurationSec: base.enterDurationSec,
            exitDurationSec: base.exitDurationSec,
            karaokeMode: base.karaokeMode,
            karaokeAccentColor: base.karaokeAccentColor,
            karaokeIdleColor: base.karaokeIdleColor,
            staggerStep: base.staggerStep,
          }
      }
    })
  }

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

  const split = splitRatioFor(aspect)
  const animate = tab === 'motion'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Centered split-pane dialog. Form on the left (tabs + fields),
          DeviceMockupPreview on the right showing the draft over the
          segment background. */}
      <DialogContent className="grid max-h-[92vh] w-full max-w-5xl grid-rows-[auto_1fr_auto] gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Type className="size-5" />
            <div>
              <h2 className="text-sm font-semibold leading-none tracking-tight">
                {isEdit ? 'Edit text style' : 'Create text style'}
              </h2>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Id: <code className="font-mono normal-case">{draft.id}</code>
              </p>
            </div>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </DialogClose>
        </div>

        {/* Split body */}
        <div
          className="grid min-h-0 overflow-hidden"
          style={{ gridTemplateColumns: `${split.left} ${split.right}` }}
        >
          {/* Left: tabs + form */}
          <div className="flex min-h-0 flex-col overflow-hidden border-r">
            <TabBar tab={tab} onChange={setTab} />
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetSection(tab)}
                  title={`Reset ${TAB_LABELS[tab]} to the values this section had when the builder opened`}
                >
                  <RotateCcw />
                  Reset {TAB_LABELS[tab].toLowerCase()}
                </Button>
              </div>
              {tab === 'identity' ? (
                <IdentityTab
                  draft={draft}
                  language={language}
                  isEdit={isEdit}
                  onName={onName}
                  onPatch={patch}
                  onReplaceDraft={(next) => setDraft(next)}
                />
              ) : null}
              {tab === 'typography' ? (
                <TypographyTab
                  draft={draft}
                  onPatch={patch}
                  aspect={aspect}
                  previewBackground={previewBackground}
                  previewText={previewText}
                />
              ) : null}
              {tab === 'layout' ? <LayoutTab draft={draft} onPatch={patch} /> : null}
              {tab === 'decorators' ? (
                <DecoratorsTab draft={draft} onPatch={patch} />
              ) : null}
              {tab === 'motion' ? <MotionTab draft={draft} onPatch={patch} /> : null}
            </div>
          </div>

          {/* Right: sticky device mockup preview */}
          <div className="flex min-h-0 items-center justify-center overflow-y-auto bg-secondary/20 p-4">
            <DeviceMockupPreview
              aspect={aspect}
              background={previewBackground}
              label="Preview"
            >
              <BuilderPreviewText
                draft={draft}
                animate={animate}
                text={previewText ?? draft.name}
              />
            </DeviceMockupPreview>
          </div>
        </div>

        {/* Footer */}
        {error ? (
          <p className="border-t bg-destructive/5 px-4 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        <div className="flex items-center justify-end gap-2 border-t bg-background px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !draft.name.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            {isEdit ? 'Update' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Preview content (rendered inside the DeviceMockupPreview frame) ----

function BuilderPreviewText({
  draft,
  text,
  animate,
}: {
  draft: TextStyle
  text: string
  animate: boolean
}) {
  const animationName: string | undefined = animate
    ? ANIMATION_FOR_MOTION[draft.enter]
    : undefined
  return (
    <>
      <div style={plateCss(draft)}>
        <span
          key={animate ? `${draft.enter}-${draft.enterDurationSec}` : 'static'}
          style={{
            ...textCss(draft, 5),
            animationName,
            animationDuration: `${Math.max(0.4, draft.enterDurationSec)}s`,
            animationIterationCount: 'infinite',
            animationDirection: 'alternate',
            animationTimingFunction: 'ease-in-out',
          }}
        >
          {text || 'Live preview'}
        </span>
      </div>
      <style>{PREVIEW_KEYFRAMES}</style>
    </>
  )
}

const ANIMATION_FOR_MOTION: Record<TextMotion, string | undefined> = {
  none: undefined,
  fade: 'nt-fade',
  slideUp: 'nt-slide-up',
  slideDown: 'nt-slide-down',
  scaleIn: 'nt-scale-in',
  typewriter: 'nt-typewriter',
  wordPop: 'nt-scale-in',
  wordHighlight: 'nt-fade',
  gradientWipe: 'nt-fade',
  slotMachine: 'nt-slide-up',
  blurReveal: 'nt-blur',
  glitch: 'nt-glitch',
  wordReveal3d: 'nt-slide-up',
  waveBounce: 'nt-slide-up',
  maskWipe: 'nt-fade',
  karaoke: 'nt-fade',
  letterStagger: 'nt-fade',
}

const PREVIEW_KEYFRAMES = `
  @keyframes nt-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes nt-slide-up { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes nt-slide-down { from { opacity: 0; transform: translateY(-20px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes nt-scale-in { from { opacity: 0; transform: scale(0.7) } to { opacity: 1; transform: scale(1) } }
  @keyframes nt-typewriter { from { opacity: 0; clip-path: inset(0 100% 0 0) } to { opacity: 1; clip-path: inset(0 0 0 0) } }
  @keyframes nt-blur { from { opacity: 0; filter: blur(8px) } to { opacity: 1; filter: blur(0) } }
  @keyframes nt-glitch { 0%, 100% { transform: translate(0, 0) } 25% { transform: translate(-1px, 1px) } 75% { transform: translate(1px, -1px) } }
`

// --- Tab bar -------------------------------------------------------------

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex border-b bg-secondary/10 text-[11px] uppercase tracking-wide">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            'flex-1 px-3 py-2 font-medium transition-colors',
            t === tab
              ? 'border-b-2 border-primary text-foreground'
              : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {TAB_LABELS[t]}
        </button>
      ))}
    </div>
  )
}

// --- Tabs ----------------------------------------------------------------

function IdentityTab({
  draft,
  language,
  isEdit,
  onName,
  onPatch,
  onReplaceDraft,
}: {
  draft: TextStyle
  language: 'vi' | 'en'
  isEdit: boolean
  onName: (name: string) => void
  onPatch: (p: Partial<TextStyle>) => void
  onReplaceDraft: (next: TextStyle) => void
}) {
  return (
    <>
      {!isEdit ? (
        <Field label="Start from preset">
          <select
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value
              if (!id) return
              const preset = BUILT_IN_TEXT_STYLES.find((s) => s.id === id)
              if (preset) onReplaceDraft(cloneFromPreset(preset, language))
              e.currentTarget.value = ''
            }}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:light_dark]"
          >
            <option value="" className="bg-background text-foreground">
              — fork a built-in style —
            </option>
            {BUILT_IN_TEXT_STYLES.map((s) => (
              <option key={s.id} value={s.id} className="bg-background text-foreground">
                {s.name} · {s.family}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            <Sparkles className="mr-1 inline size-3" />
            Forks the preset's typography + decorators into your draft. You
            get a unique id and a "(custom)" suffix in the name to start.
          </p>
        </Field>
      ) : null}
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

function TypographyTab({
  draft,
  onPatch,
  aspect,
  previewBackground,
  previewText,
}: {
  draft: TextStyle
  onPatch: (p: Partial<TextStyle>) => void
  aspect: Aspect
  previewBackground?: string
  previewText?: string
}) {
  return (
    <>
      <Field label="Font">
        <FontPickerDialog
          value={draft.fontFamily}
          onChange={(id) => onPatch({ fontFamily: id })}
          context={{
            aspect,
            background: previewBackground,
            style: draft,
            sampleText: previewText || draft.name || 'Sample text',
          }}
          trigger={
            <button
              type="button"
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:bg-secondary/50 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <span
                className="truncate"
                style={{ fontFamily: previewFontStack(draft.fontFamily) }}
              >
                {fontLabel(draft.fontFamily)}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          }
        />
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
        <ColorInput value={draft.color} onChange={(c) => onPatch({ color: c })} />
      </Field>
    </>
  )
}

function LayoutTab({
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

function DecoratorsTab({
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
              onChange={(v) => onPatch({ textStroke: { ...draft.textStroke!, widthPx: v } })}
            />
            <Field label="Stroke colour">
              <ColorInput
                value={draft.textStroke.color}
                onChange={(c) => onPatch({ textStroke: { ...draft.textStroke!, color: c } })}
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
              onChange={(v) => onPatch({ textShadow: { ...draft.textShadow!, blur: v } })}
            />
            <Field label="Shadow colour">
              <ColorInput
                value={draft.textShadow.color}
                onChange={(c) => onPatch({ textShadow: { ...draft.textShadow!, color: c } })}
              />
            </Field>
          </div>
        ) : null}
      </Field>
    </>
  )
}

function MotionTab({
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
          {unit ?? ''}
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

// --- Color input (eyedropper + recent strip) -----------------------------

declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> }
  }
}

function ColorInput({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [recent, setRecent] = useState<string[]>(() => loadRecentColors())
  const hasEyeDropper =
    typeof window !== 'undefined' && typeof window.EyeDropper === 'function'

  const commit = (c: string) => {
    onChange(c)
    if (c.startsWith('#') && c.length >= 4) {
      setRecent(pushRecentColor(c))
    }
  }

  const pickViaEyedropper = async () => {
    if (!window.EyeDropper) return
    try {
      const ed = new window.EyeDropper()
      const { sRGBHex } = await ed.open()
      commit(sRGBHex)
    } catch {
      // User dismissed eyedropper — fine, do nothing.
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith('#') ? value : '#ffffff'}
          onChange={(e) => commit(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => commit(e.target.value)}
          className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {hasEyeDropper ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={pickViaEyedropper}
            title="Pick a colour from anywhere on the screen"
            aria-label="Eyedropper"
          >
            <Pipette />
          </Button>
        ) : null}
      </div>
      {recent.length > 0 ? (
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Recent
          </span>
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className="size-5 shrink-0 rounded border border-border transition-transform hover:scale-110"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// Keep AllowedFontId reachable for callers that import it through this barrel.
export type { AllowedFontId }
