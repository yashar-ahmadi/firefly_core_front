'use client'

import { CircleAlert, CircleCheck, Clock, House, Info } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useReducer, useSyncExternalStore } from 'react'
import { SupportPhone } from '@/components/layout/support-phone'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { useHydrated } from '@/components/ui/use-media-query'
import { findGuestOrder, GUEST_ORDERS_KEY } from '@/features/orders/guest-orders'
import { TrackLink } from '@/features/orders/track/track-link'
import { useSession } from '@/lib/session/session-context'
import { readText } from '@/lib/store/json-storage'
import { PLACED_KEY, readPlaced } from '../placed-order'
import { OrderCode } from '../placed/order-code'
import { PayLater } from '../placed/pay-later'
import { thanksCopy, type ThanksTone } from './thanks-copy'
import { useConfirmOrder } from './use-confirm-order'

// `/checkout/thanks/<code>/` (spec §8.7): the order just placed, from this tab's hand-off
// (placed-order.ts) or a guest's recent orders on this device, saying only what the server
// said. A guest gets the code (to copy), the payment link and its deadline while something may
// be owed, and tracking by code and mobile, never "it is in your account"; a signed-in shopper
// gets the code and the way to the order in the account. Opened elsewhere: a calm page with the
// ways to find the order. Nothing of it is on the server (a skeleton until hydrated).

const TONES: Record<ThanksTone, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: 'bg-success/10 text-success' },
  pending: { icon: Clock, className: 'bg-brand-50 text-brand-700' },
  warning: { icon: CircleAlert, className: 'bg-warning/10 text-warning' },
  info: { icon: Info, className: 'bg-ink-100 text-ink-700' },
}

const noop = () => () => {}

/** This tab's and this device's records, as text (re-read on every render). */
function useStored(): { placed: string | null; guest: string | null } {
  const placed = useSyncExternalStore(
    noop,
    () => readText('session', PLACED_KEY),
    () => null,
  )
  const guest = useSyncExternalStore(
    noop,
    () => readText('local', GUEST_ORDERS_KEY),
    () => null,
  )
  return { placed, guest }
}

export function ThanksPage({ code, supportPhone }: { code: string; supportPhone: string | null }) {
  const hydrated = useHydrated()
  const { hasSession } = useSession()
  const [, reread] = useReducer((count: number) => count + 1, 0)
  const stored = useStored()
  const ctx = useMemo(() => (stored.placed ? readPlaced(code) : null), [stored.placed, code])
  const guestOrder = useMemo(
    () => (stored.guest ? findGuestOrder(code) : null),
    [stored.guest, code],
  )
  const again = useConfirmOrder(ctx, reread)

  if (!hydrated) {
    return (
      <div
        role="status"
        aria-label="در حال بارگذاری"
        className="flex flex-col gap-3 rounded-card bg-white p-6 shadow-card"
      >
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    )
  }

  const copy = thanksCopy(code, ctx, guestOrder, hasSession)
  const guest = ctx ? ctx.guest : guestOrder !== null || !hasSession
  const tone = TONES[copy.tone]
  const Icon = tone.icon
  const linkToken = ctx?.linkToken ?? guestOrder?.linkToken ?? null
  const expiresAt = ctx?.expiresAt ?? guestOrder?.expiresAt ?? null
  return (
    <section
      aria-labelledby="thanks-heading"
      className="flex flex-col items-start gap-5 rounded-card bg-white p-5 shadow-card md:p-8"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={cn('grid size-14 shrink-0 place-items-center rounded-full', tone.className)}
        >
          <Icon className="size-8" />
        </span>
        <div className="flex flex-col gap-1">
          <h1
            id="thanks-heading"
            className="text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10"
          >
            {copy.title}
          </h1>
          <p className="text-base leading-7 text-ink-700">{copy.body}</p>
        </div>
      </div>
      <OrderCode code={code} />
      {copy.confirm && (
        <div className="flex flex-col items-start gap-2">
          <Button loading={again.busy} onClick={() => void again.confirm()}>
            تأیید سفارش
          </Button>
          {again.error && (
            <p role="alert" className="text-base leading-7 font-medium text-danger">
              {again.error}
            </p>
          )}
          {again.error && supportPhone && (
            <SupportPhone phone={supportPhone} label="پشتیبانی" iconLabel="تماس با پشتیبانی" />
          )}
        </div>
      )}
      <PayLater
        guest={guest}
        orderCode={code}
        linkToken={linkToken}
        expiresAt={expiresAt}
        payable={copy.payable}
        confirmOnly={(ctx?.A ?? guestOrder?.A) === 0}
      />
      {/* Opened signed in without this tab's record: tracking works for any order too. */}
      {!guest && !ctx && (
        <TrackLink orderCode={code} className={buttonClasses({ variant: 'link' })}>
          پیگیری سفارش با کد سفارش و شمارهٔ موبایل
        </TrackLink>
      )}
      <Link href="/" className={buttonClasses({ variant: 'outline' })}>
        <House aria-hidden />
        ادامهٔ خرید
      </Link>
    </section>
  )
}
