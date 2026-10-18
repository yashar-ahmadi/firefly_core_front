'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import type { CancelDialogProps } from './cancel-dialog'
import type { PaySheetProps } from './pay-sheet'
import type { QrDialogProps } from './qr-dialog'

// The account order's overlays, each its own chunk, fetched on the first press that opens it
// (the JS budget: neither the list nor the order's page loads the route choice, the open attempt,
// the cancel question or the QR code otherwise). Once opened, an overlay stays mounted, so closing
// it returns the focus to its button. A chunk that cannot load says so where it would open.

function OverlayUnavailable({ open }: { open: boolean }) {
  if (!open) return null
  return (
    <p role="alert" className="basis-full text-base leading-7 text-danger">
      این بخش بارگذاری نشد؛ صفحه را دوباره باز کنید.
    </p>
  )
}

export const LazyPaySheet = dynamic<PaySheetProps>(
  () => import('./pay-sheet').then((module) => module.PaySheet).catch(() => OverlayUnavailable),
  { ssr: false },
)

export const LazyCancelDialog = dynamic<CancelDialogProps>(
  () =>
    import('./cancel-dialog').then((module) => module.CancelDialog).catch(() => OverlayUnavailable),
  { ssr: false },
)

export const LazyQrDialog = dynamic<QrDialogProps>(
  () => import('./qr-dialog').then((module) => module.QrDialog).catch(() => OverlayUnavailable),
  { ssr: false },
)

export interface Overlay {
  /** Asked for once: mounted from then on. */
  requested: boolean
  open: boolean
  show: () => void
  setOpen: (open: boolean) => void
}

export function useOverlay(): Overlay {
  const [requested, setRequested] = useState(false)
  const [open, setOpen] = useState(false)
  return {
    requested,
    open,
    show: () => {
      setRequested(true)
      setOpen(true)
    },
    setOpen,
  }
}
