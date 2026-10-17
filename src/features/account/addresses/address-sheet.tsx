'use client'

import { useIsMutating } from '@tanstack/react-query'
import { useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import type { Address } from '@/lib/api/types/address'
import { AddressForm } from './address-form'
import { valuesFrom } from './address-values'
import { ADDRESS_WRITE_KEY } from './use-addresses'

export interface AddressSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The address to edit; none for a new one. */
  initial?: Address
  /** After the save (the book has been read again by then; the cart is on its way). */
  onSaved: (address: Address) => void
}

/**
 * The address form in a `Sheet` (a bottom sheet on phones, a side panel from md): the account's
 * address book and the checkout both open it. It keeps what was typed across the sheet's switch
 * between its phone and desktop variants (which remounts the form), starts afresh each time it
 * opens (or for another address), and stays open while a save is on its way (the write would land
 * anyway).
 */
export function AddressSheet({ open, onOpenChange, initial, onSaved }: AddressSheetProps) {
  const [draft, setDraft] = useState(() => valuesFrom(initial))
  // Afresh when it opens, or for another address; not when the caller hands the same address as
  // a new object (its list was read again).
  const [shown, setShown] = useState({ open, id: initial?.id })
  if (shown.open !== open || shown.id !== initial?.id) {
    setShown({ open, id: initial?.id })
    if (open) setDraft(valuesFrom(initial))
  }
  const writing = useIsMutating({ mutationKey: ADDRESS_WRITE_KEY }) > 0
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => onOpenChange(next || writing)}
      title={initial ? 'ویرایش آدرس' : 'افزودن آدرس جدید'}
      className="md:w-[min(34rem,90vw)]"
    >
      <AddressForm
        initial={initial}
        values={draft}
        onValuesChange={setDraft}
        onSaved={onSaved}
        onCancel={() => onOpenChange(false)}
      />
    </Sheet>
  )
}
