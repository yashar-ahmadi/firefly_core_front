'use client'

import { ClipboardList, Info } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import type { SupportLine } from '@/features/payment/result-actions'
import { useSession } from '@/lib/session/session-context'
import { RecentOrders } from './recent-orders'
import { TrackForm, type TrackPrefill } from './track-form'
import { TrackResult } from './track-result'
import { useGuestOrders } from './use-guest-orders'
import { useHandedOrderCode } from './use-handed-order-code'
import { useTrackOrder } from './use-track-order'

// `/order/track/`, the island (order digest §3.1.8; Plan 4 Task 7): the form (code and mobile),
// what it found, where the code is found, this device's recent guest orders for one-tap tracking,
// and, signed in, the account's own orders as the better place. Nothing of an order is on the server: the lookup is
// a POST from here, its answer drawn here. A code handed over by the page before
// (track-handoff.ts) starts the form; a mobile never does (typed every time). Each new result
// takes the focus on its heading (TrackResult).

export interface TrackPageProps {
  /** The shop's support line, formatted on the server. */
  support: SupportLine | null
}

export function TrackPage({ support }: TrackPageProps) {
  const { hasSession } = useSession()
  const handed = useHandedOrderCode()
  const tracking = useTrackOrder()
  const [prefill, setPrefill] = useState<TrackPrefill | null>(null)
  const form = useRef<HTMLDivElement>(null)
  const guestOrders = useGuestOrders()

  const trackRecent = useCallback((code: string) => {
    setPrefill((previous) => ({ code, seq: (previous?.seq ?? 0) + 1 }))
    form.current?.scrollIntoView?.({ block: 'nearest' })
  }, [])
  const backToForm = useCallback(() => form.current?.querySelector('input')?.focus(), [])

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <div ref={form} className="rounded-card bg-white p-5 shadow-card md:p-6">
          {/* Keyed on the code handed over: the form starts from it (after hydration). */}
          <TrackForm
            key={handed}
            tracking={tracking}
            initialCode={handed}
            prefill={prefill}
            support={support}
          />
        </div>
        {tracking.result && (
          <TrackResult key={tracking.shown} result={tracking.result} support={support} />
        )}
      </div>
      <div className="flex flex-col gap-6">
        <section
          aria-labelledby="track-help-heading"
          className="flex flex-col gap-2 rounded-card bg-white p-5 shadow-card"
        >
          <h2
            id="track-help-heading"
            className="flex items-center gap-2 text-lg leading-8 font-bold text-ink-900"
          >
            <Info aria-hidden className="size-5 shrink-0 text-brand-600" />
            کد سفارش کجاست؟
          </h2>
          <p className="text-base leading-7 text-ink-700">
            کد ۱۰ رقمی سفارش در پیامک ثبت سفارش و صفحهٔ پایان خرید آمده است. شمارهٔ موبایل خریدار یا
            گیرندهٔ سفارش را هم وارد کنید؛ این شماره روی این دستگاه نگه داشته نمی‌شود.
          </p>
        </section>
        {hasSession && (
          <section className="flex flex-col items-start gap-3 rounded-card bg-brand-50 p-5">
            <p className="text-base leading-7 text-ink-800">
              سفارش‌هایی که با حساب کاربری‌تان ثبت کرده‌اید، با جزئیات کامل در «سفارش‌های من» هستند.
            </p>
            <Link
              href="/account/orders/"
              prefetch={false}
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
            >
              <ClipboardList aria-hidden />
              سفارش‌های من
            </Link>
          </section>
        )}
        <RecentOrders guestOrders={guestOrders} onTrack={trackRecent} onEmptied={backToForm} />
      </div>
    </div>
  )
}
