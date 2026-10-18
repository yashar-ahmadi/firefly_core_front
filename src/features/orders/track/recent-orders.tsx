'use client'

import { Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { formatJalaliDate, formatToman, toPersianDigits } from '@/lib/format'
import type { GuestOrders } from './use-guest-orders'

// «سفارش‌های اخیر شما» (Plan 4 Global Constraints): the guest orders this device placed
// (`ff-guest-orders`, the last 10, newest first; use-guest-orders.ts), each with its code, date
// and total, for one-tap tracking. A tap fills the code in and asks for the mobile (`onTrack`):
// the number is never kept on the device (a shared one), so it is typed every time.
// «حذف از این دستگاه» forgets one order here (the order itself is untouched), says so, and keeps
// the focus in the list (or hands it back to the form when the list is gone: `onEmptied`).
// Nothing at all without orders (or without storage).

export interface RecentOrdersProps {
  guestOrders: GuestOrders
  /** Track this order: its code into the form, the mobile asked for. */
  onTrack: (orderCode: string) => void
  /** The last one was removed: the focus goes back to the form. */
  onEmptied: () => void
}

export function RecentOrders({ guestOrders, onTrack, onEmptied }: RecentOrdersProps) {
  const { orders } = guestOrders
  const list = useRef<HTMLUListElement>(null)
  // After a removal, the row now at this place (or the last) takes the focus.
  const [refocus, setRefocus] = useState<{ index: number } | null>(null)
  useEffect(() => {
    if (!refocus) return
    const rows = list.current?.querySelectorAll<HTMLButtonElement>('[data-track-button]')
    rows?.[Math.min(refocus.index, rows.length - 1)]?.focus()
  }, [refocus])

  function remove(code: string, index: number) {
    if (!guestOrders.remove(code)) {
      announce('این سفارش از این دستگاه حذف نشد؛ دوباره تلاش کنید.')
      return
    }
    announce(`سفارش ${toPersianDigits(code)} از این دستگاه حذف شد.`)
    // The last one: the list goes with it, the focus back to the form.
    if (orders.length === 1) onEmptied()
    else setRefocus({ index })
  }

  if (orders.length === 0) return null
  return (
    <section
      aria-labelledby="recent-orders-heading"
      className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-card"
    >
      <div className="flex flex-col gap-1">
        <h2 id="recent-orders-heading" className="text-lg leading-8 font-bold text-ink-900">
          سفارش‌های اخیر شما
        </h2>
        <p className="text-sm leading-6 text-ink-600">
          سفارش‌هایی که با این دستگاه ثبت کرده‌اید. برای پیگیری، شمارهٔ موبایل هر بار پرسیده می‌شود.
        </p>
      </div>
      <ul
        ref={list}
        aria-label="سفارش‌های اخیر شما"
        className="flex flex-col divide-y divide-ink-100"
      >
        {orders.map((order, index) => (
          <li key={order.orderCode} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <bdi dir="ltr" className="text-base leading-7 font-bold text-ink-900 tabular-nums">
                {toPersianDigits(order.orderCode)}
              </bdi>
              <time dateTime={order.placedAt} className="text-sm leading-6 text-ink-600">
                {formatJalaliDate(order.placedAt)}
              </time>
            </div>
            {order.total !== undefined && (
              <p className="text-sm leading-6 text-ink-700">{formatToman(order.total)}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-track-button=""
                variant="outline"
                size="sm"
                iconStart={<Search aria-hidden />}
                onClick={() => onTrack(order.orderCode)}
              >
                پیگیری{' '}
                <span className="sr-only">{`سفارش ${toPersianDigits(order.orderCode)}`}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconStart={<Trash2 aria-hidden />}
                onClick={() => remove(order.orderCode, index)}
              >
                حذف از این دستگاه{' '}
                <span className="sr-only">{`(سفارش ${toPersianDigits(order.orderCode)})`}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
