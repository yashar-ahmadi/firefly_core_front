'use client'

import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import type { AddressSheetProps } from './address-sheet'
import type { DeleteAddressDialogProps } from './delete-address-dialog'

// The address sheet (the form, Vaul, the selects, the location block) and the delete dialog
// (Radix Dialog) load on the first press, or as the pointer or the focus reaches a button that
// opens one: the page's first load stays within the JS budget (P2-R4). These stand in while the
// code arrives (a panel opens on a press: the wait shows over the page), and when it cannot.

function OverlayLoading() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/20">
      <Spinner size="lg" label="در حال آماده‌سازی" className="text-white" />
    </div>
  )
}

/** The code could not be downloaded (a stale chunk after a deploy, a dropped connection). */
function OverlayUnavailable({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) return null
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-card bg-white p-4 text-base text-danger shadow-raised"
    >
      <p className="w-full">این بخش بارگذاری نشد.</p>
      <Button variant="outline" size="sm" onClick={reloadPage}>
        بارگذاری دوباره صفحه
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
        بستن
      </Button>
    </div>
  )
}

export const LazyAddressSheet = dynamic<AddressSheetProps>(
  () =>
    import('./address-sheet').then((module) => module.AddressSheet).catch(() => OverlayUnavailable),
  { ssr: false, loading: OverlayLoading },
)

export const LazyDeleteAddressDialog = dynamic<DeleteAddressDialogProps>(
  () =>
    import('./delete-address-dialog')
      .then((module) => module.DeleteAddressDialog)
      .catch(() => OverlayUnavailable),
  { ssr: false, loading: OverlayLoading },
)

/** Failed preloads are dropped: the press tries again. */
export const preloadAddressSheet = () => {
  import('./address-sheet').catch(() => {})
}
export const preloadDeleteDialog = () => {
  import('./delete-address-dialog').catch(() => {})
}
