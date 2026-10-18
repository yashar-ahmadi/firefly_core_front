'use client'

import { Badge, type BadgeTone } from '@/components/ui/badge'
import { REJECTION_LABELS } from '@/features/payment/card-transfer/transfer-copy'
import type { PaymentHistoryItem, ReceiptStatus } from '@/lib/api/types/payment'
import { formatToman, toPersianDigits } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import { usePaymentDetail } from './orders-api'

// One payment of an order (order digest §3.2.9–3.2.10, §2.1): the API's words for its method,
// what it was for and its status (a coloured pill that never speaks alone), its amount and when
// it settled (or was made); a bank receipt's gateway, tracking code (a string, leading zeros
// kept) and masked card, left to right; a card transfer's receipt state, and the reason when it
// was turned down (the payment's detail, read for card transfers only). A method the storefront
// never offers (a card reader, cash, a transfer the shop recorded) is a payment like any other.

const GENERIC = 'پرداخت ثبت‌شده'

const TONES: Record<string, BadgeTone> = {
  settled: 'success',
  pending: 'warning',
  awaiting_review: 'info',
  failed: 'danger',
  cancelled: 'neutral',
  refunded: 'neutral',
}

/** No display field for a receipt's status (§2.1): the shop's own words. */
const RECEIPT_WORDS: Record<ReceiptStatus, string> = {
  awaiting_review: 'در انتظار بررسی',
  approved: 'تأیید شده',
  rejected: 'رد شده',
}

function ReceiptState({ uuid }: { uuid: string }) {
  const detail = usePaymentDetail(uuid, true)
  const receipt = detail.data?.card_transfer_receipt
  if (!receipt) return null
  const words = RECEIPT_WORDS[receipt.status] ?? receipt.status
  const code = receipt.rejection_reason_code
  const reason = receipt.rejection_reason.trim()
  return (
    <div className="flex flex-col gap-0.5 text-sm leading-6 text-ink-700">
      <p>{`رسید: ${words}`}</p>
      {receipt.status === 'rejected' && (code || reason) && (
        <p>
          {'دلیل: '}
          {code && <span className="font-medium">{REJECTION_LABELS[code] ?? code}</span>}
          {code && reason && ' — '}
          {reason}
        </p>
      )}
    </div>
  )
}

export function PaymentRow({ payment }: { payment: PaymentHistoryItem }) {
  const method = payment.method_display.trim() || GENERIC
  const when = payment.settled_at ?? payment.created
  const { receipt } = payment
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base leading-7 font-medium text-ink-900">
          {method}
          {payment.applies_to_display && (
            <span className="text-sm font-normal text-ink-600">
              {' '}
              · {payment.applies_to_display}
            </span>
          )}
        </p>
        {payment.status_display && (
          <Badge tone={TONES[payment.status] ?? 'neutral'} size="sm">
            {payment.status_display}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm leading-6 text-ink-600">
        <time dateTime={when}>{formatJalaliDateTime(when)}</time>
        <span className="text-base font-bold text-ink-900">{formatToman(payment.amount)}</span>
      </div>
      {receipt && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm leading-6">
          {receipt.gateway_title && (
            <>
              <dt className="text-ink-600">درگاه</dt>
              <dd className="text-ink-800">{receipt.gateway_title}</dd>
            </>
          )}
          {receipt.tracking_code && (
            <>
              <dt className="text-ink-600">کد پیگیری</dt>
              <dd>
                <bdi dir="ltr" className="text-ink-900 tabular-nums">
                  {toPersianDigits(receipt.tracking_code)}
                </bdi>
              </dd>
            </>
          )}
          {receipt.card_pan_masked && (
            <>
              <dt className="text-ink-600">کارت</dt>
              <dd>
                <bdi dir="ltr" className="text-ink-900 tabular-nums">
                  {toPersianDigits(receipt.card_pan_masked)}
                </bdi>
              </dd>
            </>
          )}
        </dl>
      )}
      {payment.method === 'card_transfer' && <ReceiptState uuid={payment.uuid} />}
    </li>
  )
}
