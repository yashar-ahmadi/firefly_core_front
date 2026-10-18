'use client'

import { CircleCheck, CircleX, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import type { OrderListItem } from '@/lib/api/types/order-detail'
import { formatJalaliDate, formatNumber, formatToman, toPersianDigits } from '@/lib/format'
import { TrackingCode } from '../components/tracking-code'
import { statusTone } from '../status-tone'
import { CopyCode } from './copy-code'
import { MiniProgress } from './mini-progress'
import { orderActions } from './order-action-rules'
import { OrderThumbs } from './order-thumbs'

// One order of «سفارش‌های من» (order digest §6.3): an article named by its code (a link to the
// order, left to right, with «کپی»), the status in the API's words, when it was placed and how
// many units, the first lines' pictures, the server's progress, the API's total, the shipping
// method and where it goes (`address_summary`), the parcel's tracking code when it has one. ONE main action: «پرداخت» (it owes online
// money) or «تأیید سفارش» (pure pay on delivery awaiting its confirmation), both the pay sheet;
// otherwise «جزئیات سفارش». «لغو سفارش» beside it while it may be cancelled.

export const orderPath = (code: string) => `/account/orders/${code}/`
export const cardHeadingId = (code: string) => `order-card-${code}`

export interface OrderCardProps {
  order: OrderListItem
  onPay: (code: string) => void
  onCancel: (code: string) => void
}

export function OrderCard({ order, onPay, onCancel }: OrderCardProps) {
  const code = order.order_code
  const headingId = cardHeadingId(code)
  const rules = orderActions(order)
  const label = (
    <>
      <span>سفارش</span>{' '}
      <bdi dir="ltr" className="tabular-nums">
        {toPersianDigits(code)}
      </bdi>
    </>
  )
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-card bg-white p-4 shadow-card md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <h2 id={headingId} className="text-lg leading-8 font-bold text-ink-900">
            <Link
              href={orderPath(code)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control hover:text-brand-700"
            >
              {label}
            </Link>
          </h2>
          <CopyCode code={code} />
        </div>
        <Badge tone={statusTone(order.status)}>{order.status_display}</Badge>
      </div>
      {/* Two facts side by side, no separator glyph: a middle dot beside digits reads as «۰». */}
      <p className="flex flex-wrap gap-x-4 text-sm leading-6 text-ink-600">
        <time dateTime={order.placed_at}>{formatJalaliDate(order.placed_at)}</time>
        <span>{`${formatNumber(order.item_count)} کالا`}</span>
      </p>
      <OrderThumbs preview={order.item_preview} itemCount={order.item_count} />
      <MiniProgress progress={order.progress} />
      <dl className="grid gap-x-6 gap-y-1 text-base leading-7 sm:grid-cols-2">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-ink-600">مبلغ کل:</dt>
          <dd className="font-bold text-ink-900">{formatToman(order.total)}</dd>
        </div>
        {order.shipping_method_title && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-600">روش ارسال:</dt>
            <dd className="text-ink-800">{order.shipping_method_title}</dd>
          </div>
        )}
        {order.address_summary && (
          <div className="flex flex-wrap gap-x-2 sm:col-span-2">
            <dt className="text-ink-600">ارسال به:</dt>
            <dd className="min-w-0 text-ink-800">{order.address_summary}</dd>
          </div>
        )}
      </dl>
      {order.postal_tracking_code && (
        <TrackingCode code={order.postal_tracking_code} hint={false} />
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {rules.pay ? (
          <Button
            aria-haspopup="dialog"
            aria-describedby={headingId}
            iconStart={<CreditCard aria-hidden />}
            onClick={() => onPay(code)}
          >
            پرداخت
          </Button>
        ) : rules.confirm ? (
          <Button
            aria-haspopup="dialog"
            aria-describedby={headingId}
            iconStart={<CircleCheck aria-hidden />}
            onClick={() => onPay(code)}
          >
            تأیید سفارش
          </Button>
        ) : (
          <Link href={orderPath(code)} className={buttonClasses({ variant: 'outline' })}>
            جزئیات سفارش <span className="sr-only">{toPersianDigits(code)}</span>
          </Link>
        )}
        {rules.cancel && (
          <Button
            variant="ghost"
            aria-haspopup="dialog"
            aria-describedby={headingId}
            className="text-danger hover:bg-danger/10"
            iconStart={<CircleX aria-hidden />}
            onClick={() => onCancel(code)}
          >
            لغو سفارش
          </Button>
        )}
      </div>
    </article>
  )
}
