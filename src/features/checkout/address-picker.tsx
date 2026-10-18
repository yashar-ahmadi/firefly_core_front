'use client'

import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Pencil, Plus } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { FormAlert } from '@/components/form/form-alert'
import { useSubmitWait } from '@/components/form/code-timers'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { LazyAddressSheet, preloadAddressSheet } from '@/features/account/addresses/lazy-overlays'
import { useAddresses } from '@/features/account/addresses/use-addresses'
import { isLoadingSection } from '@/features/account/use-account-query'
import { ListError, THROTTLED_MESSAGE, throttleWait } from '@/features/account/lists/list-error'
import { CART_KEY } from '@/features/cart/cart-cache'
import type { Address } from '@/lib/api/types/cart'
import { AddressDetails, AddressLabel } from './address-option'
import type { Checkout } from './use-checkout'
import { isThrottled } from './use-checkout-writes'

// A signed-in shopper's destination (cart digest §6.6, §7.4): the address book as a radio group,
// the cart's own address chosen, else the default (the book's first) chosen for them. A choice
// posts `cart/destination/ {address}`. «افزودن آدرس جدید» and «ویرایش» open the address book's
// own sheet (loaded on demand); a new address becomes the destination; an edit re-reads the cart
// and its options (a new province or city clears the shipping choice). An empty book opens the
// sheet at once.

const EMPTY_BOOK = 'هنوز آدرسی ثبت نکرده\u{200C}اید. برای ارسال سفارش، آدرس تحویل را اضافه کنید.'

export function AddressPicker({ checkout }: { checkout: Checkout }) {
  const client = useQueryClient()
  const book = useAddresses()
  const addresses = book.data?.results
  // Mounted from the first request on (its code loads then), so it can close with its motion.
  const [sheet, setSheet] = useState<{ requested: boolean; open: boolean; initial?: Address }>({
    requested: false,
    open: false,
  })
  const openSheet = (initial?: Address) => setSheet({ requested: true, open: true, initial })
  const [chosenId, setChosenId] = useState<number | null>(null)
  const [failure, setFailure] = useState<{ message: string; error: unknown; at: number } | null>(
    null,
  )
  // A 429: the addresses wait out `retry_after` (the choice is never sent meanwhile).
  const lock = useSubmitWait(throttleWait(failure?.error, failure?.at ?? 0))
  const cartAddress = checkout.cart?.destination?.address?.id ?? null
  const inBook = addresses?.some((item) => item.id === cartAddress) ?? false
  const value = chosenId ?? (inBook ? cartAddress : null)

  const tried = useRef(new Set<number>())
  const pick = async (address: Pick<Address, 'id' | 'title'>) => {
    if (lock.locked) return
    setChosenId(address.id)
    setFailure(null)
    const outcome = await checkout.setDestinationByAddress(address.id)
    setChosenId(null)
    if (outcome.status === 'done') announce(`آدرس «${address.title}» برای ارسال انتخاب شد.`)
    if (outcome.status !== 'failed' || !outcome.message) return
    const throttled = isThrottled(outcome.error)
    // A throttled default is chosen again once the wait is over.
    if (throttled) tried.current.delete(address.id)
    const message = throttled ? THROTTLED_MESSAGE : outcome.message
    setFailure({ message, error: outcome.error, at: Date.now() })
  }

  // A cart without a saved address as its destination: the default (first in the book) is
  // chosen, once.
  const preselect = useEffectEvent(() => {
    const first = addresses?.[0]
    if (!first || cartAddress !== null || chosenId !== null || checkout.destinationPending) return
    if (lock.locked || tried.current.has(first.id)) return
    tried.current.add(first.id)
    void pick(first)
  })
  useEffect(() => preselect(), [addresses, cartAddress, lock.locked])

  // An empty book: the sheet opens at once (once; closed, the button is there).
  const opened = useRef(false)
  useEffect(() => {
    if (addresses?.length !== 0 || opened.current) return
    opened.current = true
    openSheet()
  }, [addresses])

  const saved = (address: Address) => {
    const edited = sheet.initial !== undefined
    setSheet((current) => ({ ...current, open: false }))
    // An edit of the destination's province or city cleared the shipping choice: the cart and
    // its options are read again. A new address becomes the destination.
    if (edited) void client.invalidateQueries({ queryKey: CART_KEY })
    else void pick(address)
  }

  let content
  if (isLoadingSection(book) && !addresses) {
    content = (
      <div role="status" aria-label={'در حال بارگذاری آدرس\u{200C}ها'} className="grid gap-3">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
    )
  } else if (!addresses) {
    content = (
      <ListError
        frame="inline"
        message={'آدرس\u{200C}های شما بارگذاری نشد.'}
        error={book.error}
        errorAt={book.errorUpdatedAt}
        onRetry={() => void book.refetch()}
        retrying={book.isFetching}
      />
    )
  } else if (addresses.length === 0) {
    content = (
      <p className="flex items-start gap-2 text-base leading-7 text-ink-700">
        <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-brand-600" />
        {EMPTY_BOOK}
      </p>
    )
  } else {
    content = (
      <RadioGroup
        aria-label="آدرس ارسال"
        aria-busy={checkout.destinationPending || undefined}
        aria-describedby={lock.locked ? lock.noteId : undefined}
        disabled={lock.locked}
        value={value === null ? '' : String(value)}
        onValueChange={(id) => {
          const address = addresses.find((item) => String(item.id) === id)
          if (address && address.id !== value) void pick(address)
        }}
        className="gap-3"
      >
        {addresses.map((address) => (
          <RadioGroupItem
            key={address.id}
            value={String(address.id)}
            variant="card"
            label={<AddressLabel address={address} />}
            description={<AddressDetails address={address} />}
            aside={
              <Button
                variant="ghost"
                size="sm"
                iconStart={<Pencil aria-hidden />}
                aria-haspopup="dialog"
                onPointerEnter={preloadAddressSheet}
                onFocus={preloadAddressSheet}
                onClick={() => openSheet(address)}
              >
                ویرایش <span className="sr-only">آدرس {address.title}</span>
              </Button>
            }
          />
        ))}
      </RadioGroup>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {failure && <FormAlert key={failure.at}>{failure.message}</FormAlert>}
      {content}
      {lock.note}
      <div className="flex flex-wrap gap-3">
        {addresses && (
          <Button
            variant="outline"
            iconStart={<Plus aria-hidden />}
            aria-haspopup="dialog"
            onPointerEnter={preloadAddressSheet}
            onFocus={preloadAddressSheet}
            onClick={() => openSheet()}
          >
            افزودن آدرس جدید
          </Button>
        )}
        {checkout.editing === 'receiver' && value !== null && (
          <Button variant="primary" onClick={checkout.finishEditing}>
            ادامه با این آدرس
          </Button>
        )}
      </div>
      {sheet.requested && (
        <WidgetBoundary name="address-sheet">
          <LazyAddressSheet
            open={sheet.open}
            onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
            initial={sheet.initial}
            onSaved={saved}
          />
        </WidgetBoundary>
      )}
    </div>
  )
}
