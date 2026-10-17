'use client'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useState, type RefObject } from 'react'
import { tell } from '@/components/ui/tell'
import { notify } from '@/components/ui/toaster'
import type { Address } from '@/lib/api/types/address'
import { CART_KEY } from '@/features/cart/cart-cache'
import type { Cart } from '@/lib/api/types/cart'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import type { AddressBook } from './address-api'
import { addressFailure, MISSING_ADDRESS } from './address-errors'
import { ADDRESSES_KEY, useDeleteAddress, useSetDefaultAddress } from './use-addresses'

/** «آدرس «…» اکنون پیش‌فرض است.» when the book (read again by then) has a new default. */
function promotion(client: QueryClient, except: number): string {
  const book = client.getQueryData<AddressBook>(ADDRESSES_KEY)
  const next = book?.results.find((address) => address.is_default && address.id !== except)
  return next ? ` آدرس «${next.title}» اکنون پیش‌فرض است.` : ''
}

export interface SheetState {
  open: boolean
  /** Opened once: its code is loaded or loading (kept mounted so it can close). */
  requested: boolean
  address?: Address
}

export interface DeletionState {
  open: boolean
  requested: boolean
  address: Address | null
  error: string | null
}

/**
 * What the address book page does: the sheet for a new or an edited address, the delete with
 * its question, and «انتخاب به‌عنوان پیش‌فرض». Every write re-reads the book and the cart (in
 * `use-addresses`) before it is reported, so a message can say which address became the
 * default. `addButton` takes the focus once a deleted address's card (the dialog's opener) is
 * gone; `onFocusCard` once a new default's card moved to the top.
 */
export function useBookActions({
  addButton,
  onFocusCard,
}: {
  addButton: RefObject<HTMLButtonElement | null>
  onFocusCard: (id: number) => void
}) {
  const client = useQueryClient()
  const remove = useDeleteAddress()
  const makeDefault = useSetDefaultAddress()
  const [sheet, setSheet] = useState<SheetState>({ open: false, requested: false })
  const [deletion, setDeletion] = useState<DeletionState>({
    open: false,
    requested: false,
    address: null,
    error: null,
  })
  const [deleted, setDeleted] = useState(false)

  const openSheet = (address?: Address) => setSheet({ open: true, requested: true, address })

  function saved(address: Address) {
    const before = sheet.address
    setSheet((state) => ({ ...state, open: false }))
    let message = before
      ? `آدرس «${address.title}» ذخیره شد.`
      : `آدرس «${address.title}» افزوده شد.`
    if (before?.is_default && !address.is_default) message += promotion(client, address.id)
    tell(message)
  }

  function askDelete(address: Address) {
    setDeleted(false)
    setDeletion({ open: true, requested: true, address, error: null })
  }

  async function confirmDelete() {
    const { address } = deletion
    if (!address || remove.isPending) return
    setDeletion((state) => ({ ...state, error: null }))
    let message = `آدرس «${address.title}» حذف شد.`
    let tone: 'success' | 'info' = 'success'
    try {
      await remove.mutateAsync({ id: address.id, address })
      if (address.is_default) message += promotion(client, address.id)
    } catch (error) {
      if (isSessionExpiredError(error)) return
      const failure = addressFailure(error)
      if (!failure.notFound) return setDeletion((state) => ({ ...state, error: failure.alert }))
      // Gone already (deleted elsewhere): the list is read again; nothing left to ask.
      message = MISSING_ADDRESS
      tone = 'info'
    }
    setDeleted(true)
    setDeletion((state) => ({ ...state, open: false }))
    tell(message, tone)
  }

  async function setDefault(address: Address) {
    try {
      await makeDefault.mutateAsync({ id: address.id })
    } catch (error) {
      if (isSessionExpiredError(error)) return
      return notify.error(addressFailure(error).alert)
    }
    onFocusCard(address.id)
    tell(`آدرس «${address.title}» پیش‌فرض شد.`)
  }

  /** The cart's checkout destination is `address` (a delete must say so). */
  const inCart = (address: Address | null) =>
    !!address && client.getQueryData<Cart>(CART_KEY)?.destination?.address?.id === address.id

  return {
    sheet,
    openSheet,
    closeSheet: () => setSheet((state) => ({ ...state, open: false })),
    saved,
    deletion: { ...deletion, pending: remove.isPending, inCart: inCart(deletion.address) },
    askDelete,
    closeDelete: (open: boolean) => setDeletion((state) => ({ ...state, open })),
    confirmDelete: () => void confirmDelete(),
    /** After a delete the opener's card is gone: the focus goes to «افزودن آدرس جدید». */
    deleteCloseFocus: (event: Event) => {
      if (!deleted) return
      event.preventDefault()
      addButton.current?.focus()
    },
    setDefault: (address: Address) => void setDefault(address),
  }
}
