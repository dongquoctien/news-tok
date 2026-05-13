'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2, Type } from 'lucide-react'
import type { SceneKind, TextStyle } from '@news-tok/shared/schema'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fontLabel } from '@/lib/font-label'
import { TextStyleBuilder } from './text-style-builder'

const FAMILY_LABEL: Record<TextStyle['family'], string> = {
  news: 'News',
  social: 'Social',
  cinematic: 'Cinematic',
  retro: 'Retro',
  playful: 'Playful',
}

/** Strip the `@font-face`-resolved Google family name back to the human name
 *  for the preview chip. Remotion's loadFont returns a family token that
 *  contains the actual name as a prefix. */
function previewFontStack(fontFamily: string): string {
  // Built-in styles store logical ids ("montserrat") rather than family
  // strings — the renderer resolves these via fonts.ts. In the Studio
  // preview the same id maps to the CSS web font that Tailwind/Next.js
  // would load when run on Google Fonts; we fall back to a sane sans
  // for ids the browser doesn't know.
  const idToCss: Record<string, string> = {
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
  return idToCss[fontFamily] ?? fontFamily
}

function plateCss(style: TextStyle): React.CSSProperties {
  const bg = style.background
  if (bg.kind === 'none') return {}
  if (bg.kind === 'solid') {
    return {
      background: bg.color,
      opacity: bg.opacity,
      padding: `${bg.paddingPct}px ${bg.paddingPct * 2}px`,
      borderRadius: bg.radiusPx,
    }
  }
  return {
    background: `linear-gradient(${bg.angleDeg}deg, ${bg.from}, ${bg.to})`,
    padding: `${bg.paddingPct}px ${bg.paddingPct * 2}px`,
    borderRadius: bg.radiusPx,
  }
}

function textCss(style: TextStyle): React.CSSProperties {
  const css: React.CSSProperties = {
    fontFamily: previewFontStack(style.fontFamily),
    // Scale logical px (designed for 1080-wide canvas) down to fit a 110px-tall card.
    fontSize: Math.max(20, Math.min(34, style.fontSize / 3.5)),
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing * 0.4,
    lineHeight: style.lineHeight,
    color: style.color,
    textAlign: style.align,
    margin: 0,
  }
  if (style.gradientFill) {
    css.background = `linear-gradient(${style.gradientFill.angleDeg}deg, ${style.gradientFill.from}, ${style.gradientFill.to})`
    ;(css as React.CSSProperties & { WebkitBackgroundClip: string }).WebkitBackgroundClip = 'text'
    ;(css as React.CSSProperties & { backgroundClip: string }).backgroundClip = 'text'
    css.color = 'transparent'
    ;(css as React.CSSProperties & { WebkitTextFillColor: string }).WebkitTextFillColor = 'transparent'
  }
  if (style.textStroke) {
    ;(css as React.CSSProperties & { WebkitTextStroke: string }).WebkitTextStroke = `${
      Math.min(2, style.textStroke.widthPx * 0.3)
    }px ${style.textStroke.color}`
  }
  if (style.textShadow) {
    const main = `${style.textShadow.offsetX}px ${style.textShadow.offsetY}px ${Math.min(
      12,
      style.textShadow.blur
    )}px ${style.textShadow.color}`
    const second = style.textShadow.secondary
      ? `, ${style.textShadow.secondary.offsetX}px ${style.textShadow.secondary.offsetY}px ${Math.min(
          12,
          style.textShadow.secondary.blur
        )}px ${style.textShadow.secondary.color}`
      : ''
    css.textShadow = main + second
  }
  return css
}

function UserAwareCard({
  style,
  selected,
  onSelect,
  sampleText,
  projectId,
  language,
  onEdited,
  onDelete,
}: {
  style: TextStyle
  selected: boolean
  onSelect: () => void
  sampleText: string
  projectId?: string
  language?: 'vi' | 'en'
  onEdited?: () => void
  onDelete?: () => void
}) {
  const isUser = style.source === 'user'
  // Built-in styles always render as plain selectable cards. User
  // styles get edit + delete affordances that float on hover so the
  // grid stays clean.
  if (!isUser || !projectId) {
    return (
      <StyleCard style={style} selected={selected} onSelect={onSelect} sampleText={sampleText} />
    )
  }
  return (
    <div className="group relative">
      <StyleCard style={style} selected={selected} onSelect={onSelect} sampleText={sampleText} />
      <div className="pointer-events-none absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <TextStyleBuilder
          projectId={projectId}
          initial={style}
          language={language ?? 'vi'}
          onSaved={() => onEdited?.()}
          trigger={
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded bg-background/95 text-muted-foreground hover:text-foreground"
              title={`Edit ${style.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Pencil className="size-3" />
            </button>
          }
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.()
          }}
          className="inline-flex size-6 items-center justify-center rounded bg-background/95 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={`Delete ${style.name}`}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  )
}

function StyleCard({
  style,
  selected,
  onSelect,
  sampleText,
}: {
  style: TextStyle
  selected: boolean
  onSelect: () => void
  sampleText: string
}) {
  const plate = plateCss(style)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex h-32 flex-col justify-between overflow-hidden rounded-md border bg-secondary/30 p-3 text-left transition-all hover:bg-secondary/60',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border'
      )}
    >
      <div className="flex flex-1 items-center justify-center">
        <div style={plate}>
          <span style={textCss(style)}>{sampleText}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="truncate">{style.name}</span>
        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[9px]">
          {FAMILY_LABEL[style.family]}
        </span>
      </div>
      <div className="truncate text-[9px] normal-case tracking-normal text-muted-foreground/80">
        {fontLabel(style.fontFamily)}
      </div>
    </button>
  )
}

export type StylePickerProps = {
  /** Currently applied style id (highlighted in the grid). */
  currentStyleId?: string
  /** Sample text rendered on every card — usually the segment headline. */
  sampleText: string
  /** Scene kind used by "Apply to all `<scene>`". */
  sceneKind?: SceneKind
  /**
   * When set, the picker shows a "This segment in variant X only" option as
   * the safest default so style edits do not leak into other variants of
   * the same project.
   */
  activeVariantId?: string | null
  /** Apply choice on confirm. */
  onApply: (input: {
    styleId: string
    scope: 'segmentInVariant' | 'segment' | 'sceneKind' | 'all'
  }) => void
  trigger: React.ReactNode
  /** Required when callers want the "Custom" tab + builder. Omitting
   *  disables user-style features and the picker behaves like before. */
  projectId?: string
  /** Project language — drives the default font for new user styles. */
  language?: 'vi' | 'en'
}

export function StylePicker({
  currentStyleId,
  sampleText,
  sceneKind,
  activeVariantId,
  onApply,
  trigger,
  projectId,
  language,
}: StylePickerProps) {
  const [open, setOpen] = useState(false)
  const [builtIn, setBuiltIn] = useState<TextStyle[] | null>(null)
  const [userStyles, setUserStyles] = useState<TextStyle[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TextStyle['family'] | 'all' | 'custom'>('all')
  const [picked, setPicked] = useState<string | null>(currentStyleId ?? null)
  const [pendingDeleteForce, setPendingDeleteForce] = useState<{
    id: string
    segmentRefs: string[]
    variantRefs: Array<{ variantId: string; sceneKind?: string; segmentId?: string }>
  } | null>(null)

  const fetchStyles = (signal?: AbortSignal) => {
    const url = projectId
      ? `/api/text-styles?projectId=${encodeURIComponent(projectId)}`
      : '/api/text-styles'
    return fetch(url, { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((body) => ({
        builtIn: (body.builtIn ?? []) as TextStyle[],
        user: (body.user ?? []) as TextStyle[],
      }))
  }

  useEffect(() => {
    if (!open || builtIn) return
    const ctrl = new AbortController()
    fetchStyles(ctrl.signal)
      .then(({ builtIn: b, user }) => {
        setBuiltIn(b)
        setUserStyles(user)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => ctrl.abort()
  }, [open, builtIn, projectId])

  useEffect(() => {
    if (open) setPicked(currentStyleId ?? null)
  }, [open, currentStyleId])

  const refresh = async () => {
    try {
      const { builtIn: b, user } = await fetchStyles()
      setBuiltIn(b)
      setUserStyles(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const visibleStyles = useMemo(() => {
    if (!builtIn) return []
    const combined = [...builtIn, ...userStyles]
    if (filter === 'all') return combined
    if (filter === 'custom') return userStyles
    return combined.filter((s) => s.family === filter)
  }, [builtIn, userStyles, filter])

  const deleteUserStyle = async (id: string, force = false) => {
    if (!projectId) return
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/text-styles?id=${encodeURIComponent(id)}${force ? '&force=1' : ''}`,
        { method: 'DELETE' }
      )
      const body = (await res.json()) as {
        error?: string
        segmentRefs?: string[]
        variantRefs?: Array<{ variantId: string; sceneKind?: string; segmentId?: string }>
      }
      if (res.status === 409) {
        // The style is still referenced. Hand the picker a structured
        // payload so the themed ConfirmDialog can list the impact before
        // the user commits to a force-delete.
        setPendingDeleteForce({
          id,
          segmentRefs: body.segmentRefs ?? [],
          variantRefs: body.variantRefs ?? [],
        })
        return
      }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      await refresh()
      if (picked === id) setPicked(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const apply = (scope: 'segmentInVariant' | 'segment' | 'sceneKind' | 'all') => {
    if (!picked) return
    onApply({ styleId: picked, scope })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="size-5" />
            Pick a text style
          </DialogTitle>
          <DialogDescription>
            Each card previews the headline rendered with that style. Click a card,
            then choose how widely to apply it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Family</span>
          {(['all', 'news', 'social', 'cinematic', 'retro', 'playful'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md border px-3 py-1 uppercase tracking-wide',
                f === filter
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-secondary'
              )}
            >
              {f === 'all' ? 'All' : FAMILY_LABEL[f]}
            </button>
          ))}
          {projectId ? (
            <>
              <button
                onClick={() => setFilter('custom')}
                className={cn(
                  'rounded-md border px-3 py-1 uppercase tracking-wide',
                  filter === 'custom'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-secondary'
                )}
              >
                Custom ({userStyles.length})
              </button>
              <div className="ml-auto">
                <TextStyleBuilder
                  projectId={projectId}
                  initial={null}
                  language={language ?? 'vi'}
                  onSaved={() => refresh()}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Plus />
                      Create new
                    </Button>
                  }
                />
              </div>
            </>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !builtIn ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading styles…
          </div>
        ) : (
          <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
            {visibleStyles.map((s) => (
              <UserAwareCard
                key={s.id}
                style={s}
                selected={picked === s.id}
                onSelect={() => setPicked(s.id)}
                sampleText={sampleText.length > 32 ? sampleText.slice(0, 30) + '…' : sampleText}
                projectId={projectId}
                language={language ?? 'vi'}
                onEdited={() => refresh()}
                onDelete={() => deleteUserStyle(s.id)}
              />
            ))}
          </div>
        )}


        <DialogFooter className="flex-wrap gap-2 sm:flex-wrap sm:space-x-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {activeVariantId ? (
            <Button
              disabled={!picked}
              onClick={() => apply('segmentInVariant')}
              title={`Pin to this segment in variant ${activeVariantId} only — other variants keep their look`}
            >
              Segment · variant {activeVariantId}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={!picked}
            onClick={() => apply('segment')}
            title="Apply to this segment across every variant"
          >
            Segment · all variants
          </Button>
          {sceneKind ? (
            <Button
              variant="outline"
              disabled={!picked}
              onClick={() => apply('sceneKind')}
              title={`Apply to every ${sceneKind} segment in the project`}
            >
              All {sceneKind}s
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={!picked}
            onClick={() => apply('all')}
            title="Apply to every segment in the project"
          >
            All segments
          </Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={!!pendingDeleteForce}
        onOpenChange={(o) => (o ? null : setPendingDeleteForce(null))}
        title="Delete a style that's still in use?"
        description={
          pendingDeleteForce ? (
            <div className="space-y-2">
              <p>
                This style is referenced by{' '}
                <strong>{pendingDeleteForce.segmentRefs.length}</strong> segment
                {pendingDeleteForce.segmentRefs.length === 1 ? '' : 's'} and{' '}
                <strong>{pendingDeleteForce.variantRefs.length}</strong> variant slot
                {pendingDeleteForce.variantRefs.length === 1 ? '' : 's'}.
              </p>
              <p>
                Deleting will scrub those references so affected segments fall
                back to the variant default (or <code>classic</code> if none).
              </p>
            </div>
          ) : null
        }
        confirmLabel="Delete anyway"
        destructive
        onConfirm={async () => {
          const target = pendingDeleteForce
          if (!target) return
          setPendingDeleteForce(null)
          await deleteUserStyle(target.id, true)
        }}
      />
    </Dialog>
  )
}
