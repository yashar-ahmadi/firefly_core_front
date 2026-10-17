'use client'

import dynamic from 'next/dynamic'
import { OverlayLoading, OverlayUnavailable } from '../overlay-fallbacks'
import type { AddressSheetProps } from './address-sheet'
import type { DeleteAddressDialogProps } from './delete-address-dialog'

// The address sheet (the form, Vaul, the selects, the location block) and the delete dialog
// (Radix Dialog) load on the first press, or as the pointer or the focus reaches a button that
// opens one: the page's first load stays within the JS budget (P2-R4). `OverlayLoading` stands
// in while the code arrives, `OverlayUnavailable` when it cannot.

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
