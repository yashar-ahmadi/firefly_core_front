'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PAYMENT_TONES } from '@/features/payment/history-labels'
import type { PaymentHistoryItem } from '@/lib/api/types/payment'
import { formatToman, toPersianDigits } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import { APPLIES_TO, labelOf, PAYMENT_METHODS, PAYMENT_STATUSES } from './wallet-labels'

// One payment of the account's history (order digest §3.2.9, §2.1): how it was paid and what
// for, in the API's words (a method nobody named is still a payment: «پرداخت ثبت‌شده»), its
// status as a pill with words, its amount, when it settled (or was made), its order, and
// «جزئیات» (a sheet: its uuid is a credential, never in a URL).

const GENERIC = 'پرداخت ثبت\u{200C}شده'

export const methodLabel = (method: string, display: string) =>
  display.trim() || PAYMENT_METHODS.find((option) => option.value === method)?.label || GENERIC

export function PaymentStatusPill({ status, display }: { status: string; display: string }) {
  return (
    <Badge tone={PAYMENT_TONES[status] ?? 'neutral'} size="sm">
      {labelOf(PAYMENT_STATUSES, status, display)}
    </Badge>
  )
}

export function HistoryRow({
  payment,
  onShowPayment,
}: {
  payment: PaymentHistoryItem
  onShowPayment: (uuid: string) => void
}) {
  const when = payment.settled_at ?? payment.created
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base leading-7 font-medium text-ink-900">
          {methodLabel(payment.method, payment.method_display)}
          <span className="text-sm font-normal text-ink-600">
            {' · '}
            {labelOf(APPLIES_TO, payment.applies_to, payment.applies_to_display)}
          </span>
        </p>
        <PaymentStatusPill status={payment.status} display={payment.status_display} />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm leading-6 text-ink-600">
        <time dateTime={when}>{formatJalaliDateTime(when)}</time>
        <span className="text-base font-bold text-ink-900">{formatToman(payment.amount)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2">
        {payment.order_code && (
          <Link
            href={`/account/orders/${payment.order_code}/`}
            className="inline-flex min-h-11 items-center rounded-control px-1 text-sm font-medium text-brand-700 hover:underline"
          >
            {`سفارش ${toPersianDigits(payment.order_code)}`}
          </Link>
        )}
        <Button
          variant="link"
          size="sm"
          aria-haspopup="dialog"
          onClick={() => onShowPayment(payment.uuid)}
        >
          جزئیات <span className="sr-only">این پرداخت</span>
        </Button>
      </div>
    </div>
  )
}
