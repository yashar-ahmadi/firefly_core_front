'use client'

import { CalendarClock, CreditCard } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { buttonClasses } from '@/components/ui/button-styles'
import type { SupportLine } from '@/features/payment/result-actions'
import { formatJalaliDate, formatToman, toPersianDigits } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import type { OrderStatusGroup, OrderTrackingResult } from '@/lib/api/types/order-detail'
import { OrderProgress } from '../components/order-progress'
import { TrackingCode } from '../components/tracking-code'
import { findGuestOrder } from '../guest-orders'
import { groupOf, isTerminalStatus } from '../order-statuses'
import { payLinkPath } from '../pay-link'
import { progressFromTracking } from '../progress'

// What tracking found (order digest §3.1.8; the answer has no address, lines, money breakdown,
// progress or timeline, by design): the status in the API's words (`status_display`), when the
// order was placed and paid, the progress derived from the status and the stamps
// (progressFromTracking), the parcel's tracking code to copy, the item count and the total (the
// API's). A payment link only when this device holds the order's link (its recent guest orders:
// the API never returns it) while the order awaits payment: a full page load (its URL holds the
// token). The heading names the order and its status and takes the focus when the result
// appears, which says it once (never the live region as well).

const TONES: Record<OrderStatusGroup, BadgeTone> = {
  awaiting_payment: 'warning',
  in_progress: 'info',
  delivered: 'success',
  returned: 'neutral',
  cancelled: 'danger',
}

function Note({
  result,
  payable,
  support,
}: {
  result: OrderTrackingResult
  payable: boolean
  support: SupportLine | null
}) {
  const ended = isTerminalStatus(result.status)
  const text =
    result.status === 'awaiting_payment'
      ? payable
        ? 'این سفارش در انتظار پرداخت است؛ تا پایان مهلت آن را پرداخت کنید.'
        : 'برای پرداخت این سفارش، لینک پرداختی که با پیامک برایتان فرستاده شده است را باز کنید.'
      : result.status === 'awaiting_review'
        ? 'رسید پرداخت این سفارش در حال بررسی است؛ نتیجه با پیامک به شما اعلام می\u{200C}شود.'
        : result.status === 'cancelled'
          ? 'این سفارش لغو شده است. اگر مبلغی برای آن پرداخت کرده\u{200C}اید، بازگشت آن را پشتیبانی پیگیری می\u{200C}کند.'
          : result.status === 'returned'
            ? 'این سفارش مرجوع شده است. برای پرسش دربارهٔ آن با پشتیبانی تماس بگیرید.'
            : null
  if (!text) return null
  return (
    <div className="flex flex-col gap-1 rounded-card bg-ink-50 p-4 text-base leading-7 text-ink-800">
      <p>{text}</p>
      {ended &&
        (support ? (
          <p className="flex flex-wrap items-center gap-x-2">
            <span>پشتیبانی:</span>
            <a
              href={`tel:${support.tel}`}
              dir="ltr"
              className="inline-flex min-h-11 items-center font-bold text-brand-700 hover:underline"
            >
              {support.shown}
            </a>
          </p>
        ) : (
          <p>با پشتیبانی فروشگاه تماس بگیرید.</p>
        ))}
    </div>
  )
}

export interface TrackResultProps {
  result: OrderTrackingResult
  support: SupportLine | null
}

export function TrackResult({ result, support }: TrackResultProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const progress = useMemo(() => progressFromTracking(result), [result])
  const group = groupOf(result.status)
  // This device's own link for the order, while it awaits payment.
  const kept = result.status === 'awaiting_payment' ? findGuestOrder(result.order_code) : null
  const facts: Array<[string, string, string?]> = [
    ['تاریخ ثبت', formatJalaliDate(result.placed_at), result.placed_at],
    ...(result.paid_at
      ? [
          ['تاریخ پرداخت', formatJalaliDate(result.paid_at), result.paid_at] as [
            string,
            string,
            string,
          ],
        ]
      : []),
    ['تعداد کالا', `${toPersianDigits(result.item_count)} کالا`],
    ['مبلغ کل', formatToman(result.total)],
  ]
  return (
    <section
      aria-labelledby="track-result-heading"
      className="flex flex-col gap-5 rounded-card bg-white p-5 shadow-card md:p-6"
    >
      <h2
        ref={heading}
        id="track-result-heading"
        tabIndex={-1}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg leading-8 font-bold text-ink-900 outline-none md:text-xl"
      >
        <span>
          {'سفارش '}
          <bdi dir="ltr" className="tabular-nums">
            {toPersianDigits(result.order_code)}
          </bdi>
        </span>
        <Badge tone={group ? TONES[group] : 'neutral'}>{result.status_display}</Badge>
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {facts.map(([term, value, iso]) => (
          <div key={term} className="flex flex-col">
            <dt className="text-sm leading-6 text-ink-600">{term}</dt>
            <dd className="text-base leading-7 font-medium text-ink-900">
              {iso ? <time dateTime={iso}>{value}</time> : value}
            </dd>
          </div>
        ))}
      </dl>
      <OrderProgress progress={progress} />
      {result.postal_tracking_code && <TrackingCode code={result.postal_tracking_code} />}
      <Note result={result} payable={kept !== null} support={support} />
      {kept && (
        <div className="flex flex-col items-start gap-2">
          {/* A full page load (its URL holds the token): credential-routes.ts. */}
          <a href={payLinkPath(kept.linkToken)} className={buttonClasses({ size: 'lg' })}>
            <CreditCard aria-hidden />
            پرداخت سفارش
          </a>
          {kept.expiresAt && (
            <p className="flex flex-wrap items-center gap-x-2 text-base leading-7 text-ink-700">
              <CalendarClock aria-hidden className="size-5 text-ink-500" />
              {'مهلت پرداخت: '}
              <time dateTime={kept.expiresAt}>{formatJalaliDateTime(kept.expiresAt)}</time>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
