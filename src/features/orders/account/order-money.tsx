import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { formatToman, toPersianDigits } from '@/lib/format'
import { isTerminalStatus } from '../order-statuses'

// An order's money (order digest §5.0, §6.4), the API's fields only, in the digest's order and in
// the cart summary's words and colours (cart-summary.tsx: savings in the sale colour, never a
// minus sign): the goods, their discount, the coupon (its code as a chip), shipping (free said as
// «رایگان», a fare the carrier collects as «پس‌کرایه», never «free»; the coupon's shipping saving
// only when there is one), packaging, the pay-on-delivery fee, tax with its rate, the total and
// the savings; then how it is paid: online (A, its prepayment inside it, never added again), at
// the door (D), what was settled each way, and what is still owed online (O; not for an order
// that ended: the API does not zero it on cancellation). Nothing is added up here. Rows that
// would only say «۰» (a discount, a fee, the online share of an order paid at the door alone) are
// left out. No state: a server component as well.

function Row({
  term,
  children,
  tone,
}: {
  term: ReactNode
  children: ReactNode
  tone?: 'saving' | 'total'
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-4 py-1.5',
        tone === 'total' && 'mt-1 border-t border-ink-100 pt-3',
      )}
    >
      <dt
        className={cn(
          'text-base leading-7',
          tone === 'total' ? 'font-bold text-ink-900' : 'text-ink-700',
        )}
      >
        {term}
      </dt>
      <dd
        className={cn(
          'text-base leading-7 font-medium text-ink-900 tabular-nums',
          tone === 'saving' && 'text-sale',
          tone === 'total' && 'text-lg font-bold',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/** «10.00» → «۱۰٪»; anything else as it came. */
function rate(value: string): string {
  const number = Number(value)
  return Number.isFinite(number) ? `${toPersianDigits(String(number))}٪` : value
}

/** The carrier collects the fare at the door (پس‌کرایه): never said to be free. */
function shipping({ money, freight_paid_by_recipient: atDoor }: OrderDetail): string {
  if (atDoor) {
    return money.shipping_cost > 0
      ? `${formatToman(money.shipping_cost)} (پس\u{200C}کرایه)`
      : 'پس\u{200C}کرایه'
  }
  return money.shipping_cost > 0 ? formatToman(money.shipping_cost) : 'رایگان'
}

export function OrderMoney({ order }: { order: OrderDetail }) {
  const { money, coupon } = order
  const online = money.amount_charged_online
  const door = money.amount_to_collect_on_delivery
  const owed = money.amount_outstanding_online > 0 && !isTerminalStatus(order.status)
  const couponShown =
    coupon.code !== null && (money.coupon_discount > 0 || coupon.discount_type === 'free_shipping')
  return (
    <div className="flex flex-col gap-4">
      <dl>
        <Row term="جمع کالاها">{formatToman(money.goods_subtotal)}</Row>
        {money.item_discount > 0 && (
          <Row term="تخفیف کالاها" tone="saving">
            {formatToman(money.item_discount)}
          </Row>
        )}
        {money.item_discount > 0 && (
          <Row term="پس از تخفیف کالاها">{formatToman(money.goods_total)}</Row>
        )}
        {couponShown && (
          <Row
            tone="saving"
            term={
              <span className="flex flex-wrap items-center gap-2">
                کد تخفیف
                <bdi
                  dir="ltr"
                  className="rounded-pill bg-sale/10 px-2 text-sm leading-6 font-bold text-sale"
                >
                  {coupon.code}
                </bdi>
                {coupon.title && <span className="text-sm text-ink-600">{coupon.title}</span>}
              </span>
            }
          >
            {money.coupon_discount > 0 ? formatToman(money.coupon_discount) : 'ارسال رایگان'}
          </Row>
        )}
        {money.coupon_discount > 0 && (
          <Row term="مبلغ کالاها پس از کد تخفیف">{formatToman(money.goods_payable)}</Row>
        )}
        <Row term="هزینهٔ ارسال">{shipping(order)}</Row>
        {money.shipping_discount > 0 && (
          <Row term="تخفیف ارسال" tone="saving">
            {formatToman(money.shipping_discount)}
          </Row>
        )}
        {money.packaging_cost > 0 && (
          <Row term="هزینهٔ بسته‌بندی">{formatToman(money.packaging_cost)}</Row>
        )}
        {money.cod_fee > 0 && <Row term="هزینهٔ پرداخت در محل">{formatToman(money.cod_fee)}</Row>}
        <Row term={`مالیات بر ارزش افزوده (${rate(money.tax_rate)})`}>
          {formatToman(money.tax_amount)}
        </Row>
        <Row term="مبلغ کل" tone="total">
          {formatToman(money.total)}
        </Row>
        {money.total_savings > 0 && (
          <Row term="سود شما از این خرید" tone="saving">
            {formatToman(money.total_savings)}
          </Row>
        )}
      </dl>
      <section aria-labelledby="order-money-split" className="rounded-card bg-ink-50 px-4 py-3">
        <h3 id="order-money-split" className="text-base leading-7 font-bold text-ink-900">
          پرداخت
        </h3>
        <dl>
          {/* Paid at the door alone: no «۰» online row (a free order still says it). */}
          {(online > 0 || door === 0) && (
            <Row term="پرداخت آنلاین">
              {formatToman(online)}
              {money.prepayment > 0 && (
                <span className="block text-sm leading-6 font-normal text-ink-600">
                  {`شامل بیعانه\u{0654} ${formatToman(money.prepayment)}`}
                </span>
              )}
            </Row>
          )}
          {door > 0 && <Row term="پرداخت هنگام تحویل">{formatToman(door)}</Row>}
          {online > 0 && (
            <Row term="پرداخت‌شده آنلاین">{formatToman(money.amount_settled_online)}</Row>
          )}
          {door > 0 && (
            <Row term="دریافت‌شده هنگام تحویل">{formatToman(money.amount_settled_on_delivery)}</Row>
          )}
          {owed && (
            <Row term="مانده برای پرداخت آنلاین">
              <span className="text-warning">{formatToman(money.amount_outstanding_online)}</span>
            </Row>
          )}
        </dl>
      </section>
    </div>
  )
}
