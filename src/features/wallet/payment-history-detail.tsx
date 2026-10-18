'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { ListError } from '@/features/account/lists/list-error'
import { isLoadingSection } from '@/features/account/use-account-query'
import { REJECTION_LABELS } from '@/features/payment/card-transfer/transfer-copy'
import { RECEIPT_WORDS } from '@/features/payment/history-labels'
import { isApiNotFound } from '@/lib/api/errors'
import type { PaymentHistoryFull } from '@/lib/api/types/wallet'
import { formatToman, toPersianDigits } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import { methodLabel, PaymentStatusPill } from './history-row'
import { APPLIES_TO, failureText, labelOf } from './wallet-labels'
import { usePayment } from './wallet-queries'

// One payment's detail (order digest §3.2.10, §2.1, §8.6), in a sheet (a bottom sheet on phones)
// over the wallet page, its own chunk: how and what for, its status, amount and dates; the
// bank's receipt (gateway, the tracking code as a string, the settlement reference, the masked
// card), a card transfer's receipt (its state; when turned down, the reason's label and the
// shop's words), a payment the shop recorded (terminal, card digits); why it failed or closed,
// in the shopper's words. 404: not this account's (or gone).

export interface PaymentHistoryDetailProps {
  uuid: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Digits and references, left to right. */
const Code = ({ children }: { children: string }) => (
  <bdi dir="ltr" className="text-ink-900 tabular-nums">
    {toPersianDigits(children)}
  </bdi>
)

function Facts({ rows }: { rows: [string, ReactNode | null | false][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base leading-7">
      {rows
        .filter(([, value]) => value)
        .map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-ink-600">{term}</dt>
            <dd className="min-w-0 text-ink-900">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

const date = (iso: string | null) => iso && <time dateTime={iso}>{formatJalaliDateTime(iso)}</time>

function Body({ payment }: { payment: PaymentHistoryFull }) {
  const failure = failureText(payment.failure_reason)
  const { receipt, card_transfer_receipt: transfer, manual_payment: manual } = payment
  const code = transfer?.rejection_reason_code
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xl leading-10 font-bold text-ink-900 tabular-nums">
          {formatToman(payment.amount)}
        </p>
        <PaymentStatusPill status={payment.status} display={payment.status_display} />
      </div>
      {failure && (
        <p className="rounded-card bg-danger/10 px-4 py-3 text-base leading-7 text-ink-900">
          {failure}
        </p>
      )}
      <Facts
        rows={[
          ['مربوط به', labelOf(APPLIES_TO, payment.applies_to, payment.applies_to_display)],
          ['روش', methodLabel(payment.method, payment.method_display)],
          [
            'سفارش',
            payment.order_code && (
              <Link
                href={`/account/orders/${payment.order_code}/`}
                className="font-medium text-brand-700 hover:underline"
              >
                {`سفارش ${toPersianDigits(payment.order_code)}`}
              </Link>
            ),
          ],
          ['ثبت', date(payment.created)],
          ['تسویه', date(payment.settled_at)],
          ['درگاه', receipt?.gateway_title],
          ['کد پیگیری', receipt?.tracking_code && <Code>{receipt.tracking_code}</Code>],
          [
            'شمارهٔ مرجع',
            receipt?.settlement_reference && <Code>{receipt.settlement_reference}</Code>,
          ],
          ['کارت', receipt?.card_pan_masked && <Code>{receipt.card_pan_masked}</Code>],
          ['پایانه', manual?.terminal_reference && <Code>{manual.terminal_reference}</Code>],
          ['چهار رقم آخر کارت', manual?.card_last_digits && <Code>{manual.card_last_digits}</Code>],
          ['شمارهٔ پیگیری', manual?.payout_reference && <Code>{manual.payout_reference}</Code>],
          ['دریافت', manual && date(manual.received_at)],
        ]}
      />
      {transfer && (
        <section aria-label="رسید کارت به کارت" className="rounded-card bg-ink-50 p-4">
          <h3 className="text-base leading-7 font-bold text-ink-900">رسید کارت به کارت</h3>
          <Facts
            rows={[
              ['وضعیت رسید', RECEIPT_WORDS[transfer.status] ?? transfer.status],
              ['زمان واریز', date(transfer.paid_at)],
              ['بررسی', date(transfer.reviewed_at)],
              [
                'دلیل رد',
                transfer.status === 'rejected' && code && (REJECTION_LABELS[code] ?? code),
              ],
              ['توضیح فروشگاه', transfer.status === 'rejected' && transfer.rejection_reason.trim()],
            ]}
          />
        </section>
      )}
    </div>
  )
}

export function PaymentHistoryDetail({ uuid, open, onOpenChange }: PaymentHistoryDetailProps) {
  const query = usePayment(uuid)
  let body
  if (query.data) body = <Body payment={query.data} />
  else if (isApiNotFound(query.error))
    body = <p className="text-base leading-7 text-ink-800">این پرداخت پیدا نشد.</p>
  else if (query.isError && !isLoadingSection(query))
    body = (
      <ListError
        frame="inline"
        message="جزئیات پرداخت خوانده نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  else
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        <VisuallyHidden role="status">در حال خواندن جزئیات پرداخت</VisuallyHidden>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 rounded-card" />
      </div>
    )
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="جزئیات پرداخت">
      {body}
    </Sheet>
  )
}
