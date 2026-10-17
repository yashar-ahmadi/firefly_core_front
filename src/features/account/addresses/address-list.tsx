'use client'

import { MapPin, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionError } from '@/features/account/dashboard/section-error'
import { AccountPageHeader } from '@/features/account/layout/account-page-header'
import { isLoadingSection } from '@/features/account/use-account-query'
import { AddressCard } from './address-card'
import {
  LazyAddressSheet,
  LazyDeleteAddressDialog,
  preloadAddressSheet,
  preloadDeleteDialog,
} from './lazy-overlays'
import { useAddresses, usePendingAddressIds } from './use-addresses'
import { useBookActions } from './use-book-actions'

function CardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3 rounded-card bg-white p-4 shadow-card md:p-5">
      <span className="flex h-8 items-center">
        <Skeleton className="h-5 w-24" />
      </span>
      {[48, 32, 64].map((width) => (
        <span key={width} className="flex h-7 items-center">
          <Skeleton className="h-4" style={{ width: `${width}%` }} />
        </span>
      ))}
      <div className="flex gap-2 border-t border-ink-100 pt-3">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-20" />
      </div>
    </div>
  )
}

/**
 * `/account/addresses/` (cart digest §7): the book, the default first as the API orders it,
 * with «افزودن آدرس جدید», an edit sheet, a delete question and «انتخاب به‌عنوان پیش‌فرض». A
 * card whose write is on its way waits; every write re-reads the book (other addresses' default
 * flags change silently) and the cart. Skeletons while it loads, «تلاش دوباره» when it cannot.
 */
export function AddressList({ title }: { title: string }) {
  const query = useAddresses()
  const pending = usePendingAddressIds()
  const addButton = useRef<HTMLButtonElement>(null)
  // A new default moved to the top and lost its button: the focus goes to its card.
  const focusCard = useRef<number | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const actions = useBookActions({
    addButton,
    onFocusCard: (id) => {
      focusCard.current = id
      setFocusRequest((count) => count + 1)
    },
  })
  const book = query.data
  const failed = query.isError && !book && !isLoadingSection(query)

  useEffect(() => {
    const id = focusCard.current
    const card =
      id === null ? null : document.querySelector<HTMLElement>(`[data-address-id="${id}"]`)
    if (!card) return
    focusCard.current = null
    card.focus()
  }, [focusRequest, book])

  const add = (
    <Button
      ref={addButton}
      iconStart={<Plus aria-hidden />}
      aria-haspopup="dialog"
      onPointerEnter={preloadAddressSheet}
      onFocus={preloadAddressSheet}
      onClick={() => actions.openSheet()}
    >
      افزودن آدرس جدید
    </Button>
  )

  return (
    <>
      <AccountPageHeader title={title} action={add} />
      {failed ? (
        <div className="rounded-card bg-white shadow-card">
          <SectionError
            message="آدرس‌ها بارگذاری نشد."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            className="min-h-32"
          />
        </div>
      ) : !book ? (
        <div aria-busy className="grid gap-4 md:gap-5 xl:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : book.results.length === 0 ? (
        <EmptyState
          icon={<MapPin />}
          title="هنوز آدرسی ثبت نکرده‌اید"
          description="آدرس‌هایتان را این‌جا نگه دارید تا هنگام خرید فقط یکی را انتخاب کنید."
          className="rounded-card bg-white py-12 shadow-card"
          action={
            <Button
              iconStart={<Plus aria-hidden />}
              aria-haspopup="dialog"
              onPointerEnter={preloadAddressSheet}
              onFocus={preloadAddressSheet}
              onClick={() => actions.openSheet()}
            >
              افزودن آدرس جدید
            </Button>
          }
        />
      ) : (
        <ul aria-label={title} className="grid gap-4 md:gap-5 xl:grid-cols-2">
          {book.results.map((address) => (
            <li key={address.id} className="flex flex-col">
              <AddressCard
                address={address}
                pending={pending.has(address.id)}
                onEdit={() => actions.openSheet(address)}
                onDelete={() => actions.askDelete(address)}
                onSetDefault={() => actions.setDefault(address)}
                onPreloadEdit={preloadAddressSheet}
                onPreloadDelete={preloadDeleteDialog}
              />
            </li>
          ))}
        </ul>
      )}
      {actions.sheet.requested && (
        <LazyAddressSheet
          open={actions.sheet.open}
          onOpenChange={(open) => {
            if (!open) actions.closeSheet()
          }}
          initial={actions.sheet.address}
          onSaved={actions.saved}
        />
      )}
      {actions.deletion.requested && (
        <LazyDeleteAddressDialog
          address={actions.deletion.address}
          open={actions.deletion.open}
          onOpenChange={actions.closeDelete}
          pending={actions.deletion.pending}
          inCart={actions.deletion.inCart}
          error={actions.deletion.error}
          onConfirm={actions.confirmDelete}
          onCloseAutoFocus={actions.deleteCloseFocus}
        />
      )}
    </>
  )
}
