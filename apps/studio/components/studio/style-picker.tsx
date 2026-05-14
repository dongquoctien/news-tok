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
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fontLabel } from '@/lib/font-label'
import {
  plateCss as libPlateCss,
  textCss as libTextCss,
} from '@/lib/text-style-preview'
import { PREVIEW_KEYFRAMES, previewAnimationStyle } from '@/lib/text-style-anim'
import { TextStyleBuilder } from './text-style-builder'
import { DeviceMockupPreview, splitRatioFor } from './device-mockup-preview'

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
  previewBackground,
  aspect,
  onEdited,
  onUserStyleSaved,
  onDelete,
}: {
  style: TextStyle
  selected: boolean
  onSelect: () => void
  sampleText: string
  projectId?: string
  language?: 'vi' | 'en'
  previewBackground?: string
  aspect?: import('@news-tok/shared/schema').Aspect
  onEdited?: () => void
  /** Bubbles the saved/edited style up so the parent (editor.tsx) can
   *  merge it into project.userTextStyles. Required to keep the React
   *  state in sync with disk — without this, the next project Save
   *  PATCH overwrites the disk back to a state that doesn't contain
   *  the new style, and the style "disappears" after F5. */
  onUserStyleSaved?: (style: TextStyle) => void
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
    <div className="group relative w-full">
      <StyleCard style={style} selected={selected} onSelect={onSelect} sampleText={sampleText} />
      <div className="pointer-events-none absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <TextStyleBuilder
          projectId={projectId}
          initial={style}
          language={language ?? 'vi'}
          aspect={aspect}
          previewBackground={previewBackground}
          previewText={sampleText}
          onSaved={(saved) => {
            onUserStyleSaved?.(saved)
            onEdited?.()
          }}
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
        'group relative flex h-[200px] w-full flex-col justify-between overflow-hidden rounded-md border bg-secondary/30 p-3 text-left transition-all hover:bg-secondary/60',
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
  /** Optional segment background path. Forwarded to the builder so the
   *  live preview renders text over the real scene background, not an
   *  abstract grey card. */
  previewBackground?: string
  /** Project aspect — forwarded to the builder + future right-pane
   *  mockup so the device frame matches the final render. */
  aspect?: import('@news-tok/shared/schema').Aspect
  /** Fired whenever the builder saves a new or edited user style.
   *  The parent must merge `style` into its `project.userTextStyles`
   *  state — without this, the next project Save PATCH overwrites
   *  disk back to a state that doesn't contain the new style, and
   *  the style "disappears" after F5. */
  onUserStyleSaved?: (style: TextStyle) => void
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
  previewBackground,
  aspect,
  onUserStyleSaved,
}: StylePickerProps) {
  const [open, setOpen] = useState(false)
  const [builtIn, setBuiltIn] = useState<TextStyle[] | null>(null)
  const [userStyles, setUserStyles] = useState<TextStyle[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TextStyle['family'] | 'all' | 'custom'>('all')
  const [picked, setPicked] = useState<string | null>(currentStyleId ?? null)
  // Hover overrides the picked id for the right-pane preview only — that
  // way users can scrub through styles to see them on the segment without
  // clicking, and the apply buttons still target whatever was last clicked.
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pendingDeleteForce, setPendingDeleteForce] = useState<{
    id: string
    segmentRefs: string[]
    variantRefs: Array<{ variantId: string; sceneKind?: string; segmentId?: string }>
  } | null>(null)
  /** Pre-flight confirmation: show this dialog before the first
   *  DELETE call, regardless of whether the style is referenced.
   *  The existing `pendingDeleteForce` flow still fires afterwards
   *  if the API returns 409 because the style is in use. */
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState<TextStyle | null>(
    null
  )

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

  const previewAspect = aspect ?? '9:16'
  const split = splitRatioFor(previewAspect)
  // Right pane previews whichever style the user is currently inspecting.
  // Hover wins over picked so users can scrub through cards before
  // committing — once they click, picked sticks until they hover elsewhere.
  const previewedId = hoveredId ?? picked
  const previewedStyle =
    visibleStyles.find((s) => s.id === previewedId) ?? null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="grid max-h-[92vh] w-full max-w-6xl grid-rows-[auto_1fr_auto] gap-0 overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Type className="size-5" />
            Pick a text style
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Hover a card to preview on the right; click to lock the pick,
            then choose how widely to apply it.
          </DialogDescription>
        </div>

        <div
          className="grid min-h-0 overflow-hidden"
          style={{ gridTemplateColumns: `${split.left} ${split.right}` }}
        >
          {/* LEFT — filters + grid */}
          <div className="flex min-h-0 flex-col overflow-hidden border-r">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-xs">
              <span className="text-muted-foreground">Family</span>
              {(['all', 'news', 'social', 'cinematic', 'retro', 'playful'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-md border px-3 py-1 uppercase tracking-wide transition-colors',
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
                      'rounded-md border px-3 py-1 uppercase tracking-wide transition-colors',
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
                      aspect={aspect}
                      previewBackground={previewBackground}
                      previewText={sampleText}
                      onSaved={(saved) => {
                        onUserStyleSaved?.(saved)
                        refresh()
                      }}
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

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : !builtIn ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading styles…
                </div>
              ) : (
                <div
                  className="grid grid-cols-3 gap-2"
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {visibleStyles.map((s) => (
                    <div
                      key={s.id}
                      className="w-full"
                      onMouseEnter={() => setHoveredId(s.id)}
                      onFocus={() => setHoveredId(s.id)}
                    >
                      <UserAwareCard
                        style={s}
                        selected={picked === s.id}
                        onSelect={() => setPicked(s.id)}
                        sampleText={
                          sampleText.length > 32 ? sampleText.slice(0, 30) + '…' : sampleText
                        }
                        projectId={projectId}
                        language={language ?? 'vi'}
                        previewBackground={previewBackground}
                        aspect={aspect}
                        onEdited={() => refresh()}
                        onUserStyleSaved={onUserStyleSaved}
                        onDelete={() => setPendingDeleteConfirm(s)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — device mockup preview */}
          <div className="flex min-h-0 items-center justify-center overflow-y-auto bg-secondary/20 p-4">
            <DeviceMockupPreview
              aspect={previewAspect}
              background={previewBackground}
              maxWidth={300}
              label={
                previewedStyle
                  ? `${previewedStyle.name} · ${FAMILY_LABEL[previewedStyle.family]}`
                  : 'Hover a style'
              }
            >
              {previewedStyle ? (
                <PreviewedTextInline
                  style={previewedStyle}
                  text={sampleText.length > 64 ? sampleText.slice(0, 60) + '…' : sampleText}
                />
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-white/50">
                  No style hovered
                </span>
              )}
            </DeviceMockupPreview>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 border-t px-4 py-3 sm:flex-wrap sm:space-x-0">
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
      {/* Pre-flight confirm — fires for every Delete click regardless
          of whether the style is in use. If the API later reports 409
          (style is referenced), the secondary `pendingDeleteForce`
          dialog below adds a second confirm with the impact list. */}
      <ConfirmDialog
        open={!!pendingDeleteConfirm}
        onOpenChange={(o) => (o ? null : setPendingDeleteConfirm(null))}
        title={`Delete "${pendingDeleteConfirm?.name ?? 'style'}"?`}
        description={
          <p>
            This removes the custom text style from the project. The
            action can&apos;t be undone — you&apos;ll need to recreate
            the style from scratch if you want it back.
          </p>
        }
        confirmLabel="Delete style"
        destructive
        onConfirm={async () => {
          const target = pendingDeleteConfirm
          if (!target) return
          setPendingDeleteConfirm(null)
          await deleteUserStyle(target.id)
        }}
      />
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

// Helper that renders the style on the preview device. Uses the shared
// /lib helpers (which accept a scale arg sized for the device frame)
// rather than the in-file `textCss` that's tuned for small card previews.
//
// We also honour the style's `anchor` / `align` / `marginPct` so the
// preview shows where the text will actually land on the rendered
// video — without this wrapper, the DeviceMockupPreview's flex
// centring would pin every style to the middle regardless of what it
// declared. Mirrors `BuilderPreviewText` in the TextStyleBuilder.
function PreviewedTextInline({ style, text }: { style: TextStyle; text: string }) {
  const justify =
    style.anchor === 'top'
      ? 'flex-start'
      : style.anchor === 'bottom'
        ? 'flex-end'
        : 'center'
  const items =
    style.align === 'left'
      ? 'flex-start'
      : style.align === 'right'
        ? 'flex-end'
        : 'center'
  const animStyle = previewAnimationStyle(style.enter, style.enterDurationSec)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: `${style.marginPct}%`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        alignItems: items,
        pointerEvents: 'none',
      }}
    >
      <div style={libPlateCss(style)}>
        <span
          // Remount whenever the previewed style changes so CSS
          // animation restarts cleanly — hovering style A then style B
          // would otherwise leave B's timer running from A's old offset.
          key={`${style.id}-${style.enter}-${style.enterDurationSec}`}
          style={{ ...libTextCss(style, 5), ...animStyle }}
        >
          {text}
        </span>
      </div>
      {/* Inject keyframes inside the dialog DOM so they're live as
          soon as the picker opens. Reusing the same `<style>` block in
          builder + picker is fine — duplicate `@keyframes` declarations
          with identical bodies don't fight each other. */}
      <style>{PREVIEW_KEYFRAMES}</style>
    </div>
  )
}
