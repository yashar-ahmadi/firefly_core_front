import { Badge } from '@/components/ui/badge'
import { OrderCode } from '@/features/checkout/placed/order-code'
import type { OrderPaymentLink } from '@/lib/api/types/order'
import { formatToman, toPersianDigits } from '@/lib/format'
import { formatJalaliDate } from '@/lib/format/date'

// What the payment link says of its order (order digest §2 `OrderPaymentLink`, §5.0): the code
// (copied whole, left to right), when it was placed (Jalali), its status as the server names it,
// how many items, and the money split with the API's own fields only: the total, the online
// share A (with the deposit P inside it, never a line of its own), the door's share D, what has
// arrived online, and what is still owed online O (what a payment charges). No sums here.

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={strong ? 'font-bold text-ink-900' : 'text-ink-700'}>{label}</dt>
      <dd className={strong ? 'text-lg font-bold text-ink-900' : 'font-medium text-ink-900'}>
        {formatToman(value)}
      </dd>
    </div>
  )
}

export function PayLinkSummary({ link }: { link: OrderPaymentLink }) {
  const outstanding = link.amount_outstanding_online
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <OrderCode code={link.order_code} />
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base leading-7 text-ink-700">
          <Badge tone={link.status === 'awaiting_payment' ? 'warning' : 'info'}>
            {link.status_display}
          </Badge>
          <span>
            {'ثبت شده در '}
            <time dateTime={link.placed_at}>{formatJalaliDate(link.placed_at)}</time>
          </span>
          <span>{`${toPersianDigits(link.item_count)} کالا`}</span>
        </p>
      </div>
      <dl
        aria-label="مبالغ سفارش"
        className="divide-y divide-ink-100 rounded-card bg-ink-50 px-4 py-2 text-base leading-7"
      >
        <Row label="مبلغ کل سفارش" value={link.total} />
        {link.amount_charged_online > 0 && (
          <div>
            <Row label="پرداخت آنلاین" value={link.amount_charged_online} />
            {link.prepayment > 0 && (
              <p className="pb-1.5 text-sm leading-6 text-ink-600">
                {`شامل بیعانه\u{0654} ${formatToman(link.prepayment)}`}
              </p>
            )}
          </div>
        )}
        {link.amount_to_collect_on_delivery > 0 && (
          <Row label="پرداخت هنگام تحویل" value={link.amount_to_collect_on_delivery} />
        )}
        {link.amount_settled_online > 0 && (
          <Row label={'پرداخت آنلاین انجام\u{200C}شده'} value={link.amount_settled_online} />
        )}
        {outstanding > 0 && (
          <Row label={'مانده\u{0654} پرداخت آنلاین'} value={outstanding} strong />
        )}
      </dl>
    </div>
  )
}
