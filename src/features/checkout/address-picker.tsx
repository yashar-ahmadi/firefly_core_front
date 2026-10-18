'use client'

import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, MapPin, Pencil, Plus } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { LazyAddressSheet, preloadAddressSheet } from '@/features/account/addresses/lazy-overlays'
import { useAddresses } from '@/features/account/addresses/use-addresses'
import { isLoadingSection } from '@/features/account/use-account-query'
import { ListError } from '@/features/account/lists/list-error'
import { CART_KEY } from '@/features/cart/cart-cache'
import { FormAlert } from '@/components/form/form-alert'
import type { Address } from '@/lib/api/types/cart'
import { formatIranMobile, toPersianDigits } from '@/lib/format'
import type { Checkout } from './use-checkout'

// A signed-in shopper's destination (cart digest §6.6, §7.4): the address book as a radio group,
// the cart's own address chosen, else the default (the book's first) chosen for them. A choice
// posts `cart/destination/ {address}`. «افزودن آدرس جدید» and «ویرایش» open the address book's
// own sheet (loaded on demand); a new address becomes the destination; an edit re-reads the cart
// and its options (a new province or city clears the shipping choice). An empty book opens the
// sheet at once.

const EMPTY_BOOK = 'هنوز آدرسی ثبت نکرده\u{200C}اید. برای ارسال سفارش، آدرس تحویل را اضافه کنید.'

function AddressLabel({ address }: { address: Address }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span dir="auto" className="font-bold text-ink-900">
        {address.title}
      </span>
      {address.is_default && (
        <Badge tone="brand" size="sm">
          <BadgeCheck aria-hidden />
          پیش‌فرض
        </Badge>
      )}
    </span>
  )
}

function AddressDetails({ address }: { address: Address }) {
  return (
    <span className="flex flex-col">
      <span>
        {`گیرنده: ${address.receiver_full_name} · `}
        <span dir="ltr">{formatIranMobile(address.receiver_mobile)}</span>
      </span>
      <span className="break-words">{address.full_address}</span>
      {address.postal_code && <span>{`کد پستی: ${toPersianDigits(address.postal_code)}`}</span>}
    </span>
  )
}

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
  const [failure, setFailure] = useState<string | null>(null)
  const cartAddress = checkout.cart?.destination?.address?.id ?? null
  const inBook = addresses?.some((item) => item.id === cartAddress) ?? false
  const value = chosenId ?? (inBook ? cartAddress : null)

  const pick = async (address: Pick<Address, 'id' | 'title'>) => {
    setChosenId(address.id)
    setFailure(null)
    const outcome = await checkout.setDestinationByAddress(address.id)
    setChosenId(null)
    if (outcome.status === 'done') announce(`آدرس «${address.title}» برای ارسال انتخاب شد.`)
    else if (outcome.status === 'failed' && outcome.message) setFailure(outcome.message)
  }

  // A cart without a saved address as its destination: the default (first in the book) is
  // chosen, once.
  const tried = useRef(new Set<number>())
  const preselect = useEffectEvent(() => {
    const first = addresses?.[0]
    if (!first || cartAddress !== null || chosenId !== null || checkout.destinationPending) return
    if (tried.current.has(first.id)) return
    tried.current.add(first.id)
    void pick(first)
  })
  useEffect(() => preselect(), [addresses, cartAddress])

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
      {failure && <FormAlert>{failure}</FormAlert>}
      {content}
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
