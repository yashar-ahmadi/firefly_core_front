import { Badge } from '@/components/ui/badge'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { formatIranMobile, toPersianDigits } from '@/lib/format'
import { TrackingCode } from '../components/tracking-code'

// An order's delivery and receiver (order digest §6.4): the shipping method (the carrier), the
// business days it takes, «پس‌کرایه» (the receiver pays the freight at the door) and «پرداخت در
// محل» (a pay-on-delivery order), the parcel's tracking code; the receiver's name, mobile, email,
// address with plaque and unit, postal code, and the shopper's note. As the API gave them.

/** The business days it takes, as said: «۲ تا ۴», «تا ۱» (from none), «همان روز» (none at all). */
function days({ delivery_min_days: min, delivery_max_days: max }: OrderDetail): string | null {
  const most = max ?? min
  if (most === null) return null
  if (most === 0) return 'تحویل در همان روز کاری'
  if (min === 0) return `تحویل تا ${toPersianDigits(most)} روز کاری`
  if (min !== null && min !== most)
    return `تحویل در ${toPersianDigits(min)} تا ${toPersianDigits(most)} روز کاری`
  return `تحویل در ${toPersianDigits(most)} روز کاری`
}

export function OrderDelivery({ order }: { order: OrderDetail }) {
  const eta = days(order)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-base leading-7">
        {order.shipping_method_title && (
          <p className="font-medium text-ink-900">{order.shipping_method_title}</p>
        )}
        {eta && <p className="text-ink-700">{eta}</p>}
      </div>
      {(order.freight_paid_by_recipient || order.cash_on_delivery) && (
        <div className="flex flex-col gap-2">
          {order.cash_on_delivery && (
            <p className="flex flex-wrap items-center gap-2 text-sm leading-6 text-ink-700">
              <Badge tone="info">پرداخت در محل</Badge>
              سهم پرداخت هنگام تحویل را به مأمور ارسال می‌پردازید.
            </p>
          )}
          {order.freight_paid_by_recipient && (
            <p className="flex flex-wrap items-center gap-2 text-sm leading-6 text-ink-700">
              <Badge tone="info">پس‌کرایه</Badge>
              هزینهٔ ارسال را گیرنده هنگام تحویل می‌پردازد.
            </p>
          )}
        </div>
      )}
      {order.postal_tracking_code && <TrackingCode code={order.postal_tracking_code} />}
    </div>
  )
}

export function OrderReceiver({ order }: { order: OrderDetail }) {
  const r = order.receiver
  const place = [r.province_name, r.city_name, r.address].filter(Boolean).join('، ')
  const extras = [
    r.plaque && `پلاک ${toPersianDigits(r.plaque)}`,
    r.unit && `واحد ${toPersianDigits(r.unit)}`,
  ]
    .filter(Boolean)
    .join('، ')
  return (
    <div className="flex flex-col gap-2 text-base leading-7 text-ink-800">
      <p className="font-medium text-ink-900">{r.receiver_full_name}</p>
      {r.receiver_mobile && (
        <p>
          <bdi dir="ltr">{formatIranMobile(r.receiver_mobile)}</bdi>
        </p>
      )}
      {r.receiver_email && (
        <p>
          <bdi dir="ltr" className="break-all">
            {r.receiver_email}
          </bdi>
        </p>
      )}
      <p>
        {place}
        {extras && `، ${extras}`}
      </p>
      {r.postal_code && (
        <p className="text-sm text-ink-700">
          {'کد پستی: '}
          <bdi dir="ltr" className="tabular-nums">
            {toPersianDigits(r.postal_code)}
          </bdi>
        </p>
      )}
      {order.customer_note?.trim() && (
        <div className="mt-1 rounded-control bg-ink-50 px-3 py-2 text-sm leading-6">
          <p className="font-medium text-ink-800">یادداشت شما</p>
          <p dir="auto" className="whitespace-pre-line text-ink-700">
            {order.customer_note}
          </p>
        </div>
      )}
    </div>
  )
}
