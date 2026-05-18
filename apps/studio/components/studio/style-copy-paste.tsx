'use client'

import { ChevronDown, ClipboardCopy, ClipboardPaste } from 'lucide-react'
import type { Segment, Variant } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStyleClipboard, type StyleSnapshot } from '@/lib/style-clipboard'
import { cn } from '@/lib/utils'

export type PasteTargetMode = 'segment' | 'sceneKind' | 'all'

/**
 * Top-of-Style-tab strip exposing the in-session "style cluster"
 * copy + paste flow.
 *
 * Left button — copies the current segment's layout/eyebrow/chips/
 * fileId + textStyleId + fontOverride + colorOverride into a
 * module-level clipboard. Recording also captures variant + segment
 * provenance so the next user sees "Đã chép từ segment 2" before
 * they paste.
 *
 * Right control — split button: the main click pastes onto the
 * currently-edited segment; the chevron opens a menu with
 * "paste onto every <sceneKind>" and "paste onto every segment".
 *
 * When the clipboard is empty, the paste side is disabled and a
 * tooltip explains how to fill it. We DO NOT pre-fill it on first
 * open even when there's a "default" segment — pasting silently
 * is too easy to do by accident.
 */
export function StyleCopyPaste({
  segment,
  segmentIndex,
  activeVariantId,
  variants,
  onPaste,
}: {
  segment: Segment
  /** 1-based index for the hint copy ("from segment 2"). */
  segmentIndex: number
  activeVariantId: string | null
  variants: Variant[]
  onPaste: (mode: PasteTargetMode, snapshot: StyleSnapshot) => void
}) {
  const { snapshot, setSnapshot } = useStyleClipboard()

  const copy = () => {
    const next: StyleSnapshot = {
      layoutId: segment.layoutId,
      eyebrow: segment.eyebrow,
      chips: segment.chips,
      fileId: segment.fileId,
      textStyleId: resolveTextStyleId(segment, activeVariantId, variants),
      fontOverride: resolveFontOverride(segment, activeVariantId, variants),
      colorOverride: resolveColorOverride(segment, activeVariantId, variants),
      // highlightStyle is segment-scoped (no per-variant override yet),
      // so the resolver here is trivial — but kept for symmetry with
      // the other fields if we ever add variant scoping.
      highlightStyle: segment.highlightStyle,
      sourceSegmentId: segment.id,
      sourceSegmentLabel: shortLabel(segment, segmentIndex),
      sourceVariantId: activeVariantId,
      copiedAt: Date.now(),
    }
    setSnapshot(next)
  }

  const canPaste = !!snapshot && snapshot.sourceSegmentId !== segment.id
  const sceneKindLabel = String(segment.scene).toUpperCase()

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-secondary/30 p-2.5">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={copy}
          title="Chép layout, font, màu của segment này"
        >
          <ClipboardCopy />
          Copy style
        </Button>
        {/* Split button: left half pastes to current segment, right
            chevron opens scope menu. Disabled when nothing copied or
            the source IS this segment (no-op). */}
        <div className="inline-flex">
          <Button
            variant="default"
            size="sm"
            disabled={!canPaste}
            onClick={() => snapshot && onPaste('segment', snapshot)}
            className="rounded-r-none"
            title={
              !snapshot
                ? 'Bấm "Copy style" ở một segment khác trước'
                : snapshot.sourceSegmentId === segment.id
                  ? 'Đây chính là segment đã chép — chọn segment khác để paste'
                  : 'Dán vào segment đang chỉnh'
            }
          >
            <ClipboardPaste />
            Paste style
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={!snapshot}
                className="rounded-l-none border-l border-primary-foreground/20 px-2"
                title="Phạm vi dán"
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                onClick={() => snapshot && onPaste('segment', snapshot)}
                disabled={!canPaste}
              >
                Dán vào segment hiện tại
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => snapshot && onPaste('sceneKind', snapshot)}
                disabled={!snapshot}
              >
                Dán vào mọi segment {sceneKindLabel}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => snapshot && onPaste('all', snapshot)}
                disabled={!snapshot}
              >
                Dán vào toàn bộ segment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Source hint — sits below so a long "Copied from segment 12
          (Bão số 5 đổi hướng đột ngột vào sáng mai)" doesn't break
          the button row layout. Empty paragraph instead of nothing
          so the strip's height doesn't jump when copy fires. */}
      <p
        className={cn(
          'text-[10px] leading-snug',
          snapshot ? 'text-muted-foreground' : 'text-muted-foreground/60'
        )}
      >
        {snapshot ? (
          <>
            Đã chép từ <span className="font-medium">{snapshot.sourceSegmentLabel}</span>
            {' · '}
            {summarise(snapshot)}
          </>
        ) : (
          <>Chép layout, font, màu, text style từ segment này để dán nhanh sang segment khác.</>
        )}
      </p>
    </div>
  )
}

/**
 * Variant override > segment override > undefined. Mirrors the
 * resolution rule the renderer uses so a copy faithfully captures
 * "what the user is actually seeing" in the active variant.
 */
function resolveTextStyleId(
  segment: Segment,
  activeVariantId: string | null,
  variants: Variant[]
): string | undefined {
  if (activeVariantId) {
    const v = variants.find((x) => x.id === activeVariantId)
    const perSeg = v?.textStyleBySegmentId?.[segment.id]
    if (perSeg) return perSeg
  }
  return segment.textStyleId
}

function resolveFontOverride(
  segment: Segment,
  activeVariantId: string | null,
  variants: Variant[]
): string | undefined {
  if (activeVariantId) {
    const v = variants.find((x) => x.id === activeVariantId)
    const perSeg = v?.fontOverrideBySegmentId?.[segment.id]
    if (perSeg) return perSeg
  }
  return segment.fontOverride
}

function resolveColorOverride(
  segment: Segment,
  activeVariantId: string | null,
  variants: Variant[]
) {
  if (activeVariantId) {
    const v = variants.find((x) => x.id === activeVariantId)
    const perSeg = v?.colorOverrideBySegmentId?.[segment.id]
    if (perSeg) return perSeg
  }
  return segment.colorOverride
}

/**
 * "Segment 2 (Bão số 5 đổi hướng đột ngột vào sáng mai)" — trimmed
 * to ~40 chars so the hint stays one line on the narrow editor
 * pane. The full text is never user-input-anchored so we can be
 * aggressive with truncation.
 */
function shortLabel(segment: Segment, idx: number): string {
  const raw = segment.text.trim().replace(/\s+/g, ' ')
  const teaser = raw.length > 40 ? raw.slice(0, 38) + '…' : raw
  return `segment ${idx}${teaser ? ` (${teaser})` : ''}`
}

/**
 * One-line summary of what's in the clipboard so the user can sanity
 * check before pasting onto every segment. Only counts non-empty
 * fields — pasting "nothing" onto every segment would visually do
 * nothing but it's still useful to know the clipboard is "empty-ish".
 */
function summarise(s: StyleSnapshot): string {
  const parts: string[] = []
  if (s.layoutId) parts.push(`layout ${s.layoutId.replace('builtin-', '')}`)
  if (s.textStyleId) parts.push(`style ${s.textStyleId}`)
  if (s.fontOverride) parts.push(`font ${s.fontOverride}`)
  if (s.colorOverride && Object.keys(s.colorOverride).length > 0) parts.push('colour')
  if (s.highlightStyle) parts.push('highlight')
  if (s.eyebrow) parts.push('eyebrow')
  if (s.chips && s.chips.length > 0) parts.push(`${s.chips.length} chips`)
  return parts.length === 0 ? 'không có gì để dán' : parts.join(' · ')
}
