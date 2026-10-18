'use client'

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import type { WalletTransaction } from '@/lib/api/types/wallet'
import { formatToman, toPersianDigits } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import { CAUSES, DIRECTIONS, labelOf } from './wallet-labels'

// One movement of the ledger (order digest §2, §7): its cause in the API's words, its direction
// in words and by sign and colour (never colour alone), the amount (always positive: the sign is
// the direction's), the balance right after it as the API gives it (nothing summed here), when,
// the operator's reason, and its links (the order's page; the payment's detail, in a sheet,
// because its uuid is a credential; the withdrawal, on its tab).

/** Kept attached to the digits inside right-to-left text, as Intl writes a minus sign. */
const LTR_MARK = '\u{200E}'

export interface TransactionRowProps {
  row: WalletTransaction
  onShowPayment: (uuid: string) => void
  /** The withdrawal's place on its tab. */
  withdrawalHref: (uuid: string) => string
  onFollow: (event: MouseEvent<HTMLAnchorElement>) => void
}

export function TransactionRow({
  row,
  onShowPayment,
  withdrawalHref,
  onFollow,
}: TransactionRowProps) {
  const credit = row.direction === 'credit'
  const Icon = credit ? ArrowDownLeft : ArrowUpRight
  const direction = labelOf(DIRECTIONS, row.direction, row.direction_display)
  const sign = credit ? '+' : '\u{2212}'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 text-base leading-7 font-medium text-ink-900">
          <span
            aria-hidden
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full',
              credit ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
            )}
          >
            <Icon className="size-4" />
          </span>
          {labelOf(CAUSES, row.cause, row.cause_display)}
        </p>
        <p
          className={cn(
            'text-base leading-7 font-bold tabular-nums',
            credit ? 'text-success' : 'text-danger',
          )}
        >
          <span className="me-2 rounded-pill bg-ink-100 px-2 py-0.5 text-sm font-medium text-ink-700">
            {direction}
          </span>
          {`${LTR_MARK}${sign}${formatToman(row.amount)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm leading-6 text-ink-600">
        <time dateTime={row.created}>{formatJalaliDateTime(row.created)}</time>
        <span>
          {'موجودی پس از تراکنش: '}
          <span className="font-medium text-ink-800">{formatToman(row.balance_after)}</span>
        </span>
      </div>
      {row.reason.trim() && <p className="text-sm leading-6 text-ink-700">{row.reason}</p>}
      {(row.order_code || row.payment_uuid || row.withdrawal_uuid) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {row.order_code && (
            <Link
              href={`/account/orders/${row.order_code}/`}
              className="inline-flex min-h-11 items-center rounded-control px-1 text-sm font-medium text-brand-700 hover:underline"
            >
              {`سفارش ${toPersianDigits(row.order_code)}`}
            </Link>
          )}
          {row.payment_uuid && (
            <Button
              variant="link"
              size="sm"
              aria-haspopup="dialog"
              onClick={() => onShowPayment(row.payment_uuid!)}
            >
              جزئیات پرداخت
            </Button>
          )}
          {row.withdrawal_uuid && (
            <Link
              href={withdrawalHref(row.withdrawal_uuid)}
              onClick={onFollow}
              scroll={false}
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-control px-1 text-sm font-medium text-brand-700 hover:underline"
            >
              درخواست برداشت
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
