'use client'

import { useEffect, useState } from 'react'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'

export type ConfirmDialogProps = {
  /** Controls visibility. Pair with `onOpenChange` so the caller owns the
   *  open/close lifecycle — keeps the API consistent with the shadcn
   *  Dialog primitive. */
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Body text or rich content. Strings render inside a `<p>` so the
   *  default Tailwind paragraph spacing applies. */
  description?: React.ReactNode
  /** "Delete", "Discard", … Defaults to "Confirm". */
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as destructive (red) when the action is
   *  irreversible — delete, force-cascade, etc. */
  destructive?: boolean
  /** Called when the user clicks confirm. The dialog stays open until
   *  this resolves so callers can show a spinner / surface errors. */
  onConfirm: () => void | Promise<void>
}

/**
 * Themed replacement for `window.confirm()`. The browser-native dialog
 * ignores the Studio theme tokens and looks alien against shadcn cards,
 * so every destructive action in the app should go through this instead.
 *
 * The component owns the busy state so callers don't have to wire a
 * spinner separately — `onConfirm` can be async and the confirm button
 * locks + spins until it settles.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  // Reset the busy flag whenever the dialog closes — otherwise a failed
  // onConfirm that left the dialog open via a re-throw would still show
  // a spinner the next time the dialog re-opens.
  useEffect(() => {
    if (!open) setBusy(false)
  }, [open])

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // The caller is responsible for surfacing the error (toast / inline
      // message). We just leave the dialog open so the user can retry.
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold leading-snug">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription asChild>
              <div className="text-sm leading-relaxed text-muted-foreground">
                {typeof description === 'string' ? <p>{description}</p> : description}
              </div>
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
