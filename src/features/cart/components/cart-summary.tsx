import { useId, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import type { Cart } from '@/lib/api/types/cart'
import { formatNumber, formatToman } from '@/lib/format'
import { couponApplied } from '../coupon-messages'

// The summary of a cart (cart digest §5.3), for the cart page and, as `variant="checkout"`, for
// the checkout. Every amount is one of the cart's own fields: nothing is added up or derived
// here, so what the shopper reads is what the API will charge.

const AFTER_SHIPPING = 'پس از انتخاب روش ارسال'
const SHIPPING_NOTE = 'هزینه\u{0654} ارسال پس از انتخاب روش ارسال به مبلغ کل افزوده می\u{200C}شود.'

export interface CartSummaryProps {
  cart: Cart
  variant: 'cart' | 'checkout'
  className?: string
  /** Its heading, when the page shows it twice (the checkout's review: «مبالغ سفارش»). */
  title?: string
}

function Row({
  label,
  children,
  tone = 'plain',
  note,
}: {
  label: ReactNode
  children: ReactNode
  tone?: 'plain' | 'saving' | 'total'
  /** Said under the row, as part of its value (a stale shipping choice's reason). */
  note?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 py-1.5',
        tone === 'total' && 'mt-2 border-t border-ink-200 pt-3',
      )}
    >
      <dt className={cn('text-ink-700', tone === 'total' && 'font-bold text-ink-900')}>{label}</dt>
      <dd
        className={cn(
          // A value pushed to its own line by a long label stays at the row's end.
          'ms-auto shrink-0 text-end font-medium text-ink-900 tabular-nums',
          tone === 'saving' && 'text-sale',
          tone === 'total' && 'text-lg font-bold',
        )}
      >
        {children}
      </dd>
      {note && <dd className="basis-full pt-1 text-sm leading-6 text-warning">{note}</dd>}
    </div>
  )
}

/** The shipping row's value: the chosen method's cost once there is one the API can price. */
function shippingValue(cart: Cart): string {
  const { shipping } = cart
  if (!shipping.is_selected || !shipping.is_available) return AFTER_SHIPPING
  // The fare is collected at the door by the carrier: never «free».
  if (shipping.freight_paid_by_recipient) return 'پس\u{200C}کرایه'
  return cart.shipping_cost === 0 ? 'رایگان' : formatToman(cart.shipping_cost)
}

/**
 * What the shopper pays where, at the checkout (order digest §5.0), once shipping is priced
 * (before, A is not final): «پرداخت آنلاین: A», the prepayment said inside it (never a line to
 * add), and «پرداخت هنگام تحویل: D» when something is paid at the door.
 */
function CheckoutShares({ cart }: { cart: Cart }) {
  if (!(cart.shipping.is_selected && cart.shipping.is_available)) return null
  return (
    <>
      <Row
        label="پرداخت آنلاین"
        note={
          cart.prepayment > 0 ? (
            <span className="text-ink-600">{`شامل بیعانه\u{0654} ${formatToman(cart.prepayment)}`}</span>
          ) : null
        }
      >
        {formatToman(cart.amount_charged_online)}
      </Row>
      {cart.amount_to_collect_on_delivery > 0 && (
        <Row label="پرداخت هنگام تحویل">{formatToman(cart.amount_to_collect_on_delivery)}</Row>
      )}
    </>
  )
}

/**
 * The goods (and their count), product and coupon discounts (the code as a chip; a
 * free-shipping coupon says so), the goods after discounts, shipping (or «پس از انتخاب روش
 * ارسال»), packaging, the shipping discount, the COD fee, tax and the total; the online and
 * at-the-door shares when part is paid on delivery (with the prepayment), and «سود شما از این
 * خرید» when there is a saving. Rows the API has nothing for (0) are left out, tax excepted. At
 * the checkout the online share is always said once shipping is priced (`CheckoutShares`).
 */
export function CartSummary({ cart, variant, className, title }: CartSummaryProps) {
  const headingId = useId()
  const { coupon, shipping } = cart
  const applied = couponApplied(coupon)
  const discounted = cart.item_discount > 0 || applied
  const stale = shipping.is_selected && !shipping.is_available
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="text-lg leading-8 font-bold text-ink-900">
        {title ?? (variant === 'cart' ? 'خلاصه\u{0654} سبد خرید' : 'خلاصه\u{0654} سفارش')}
      </h2>
      <dl className="mt-2 text-base">
        <Row label={`قیمت کالاها (${formatNumber(cart.item_count)})`}>
          {formatToman(cart.goods_subtotal)}
        </Row>
        {cart.item_discount > 0 && (
          <Row label="تخفیف کالاها" tone="saving">
            {formatToman(cart.item_discount)}
          </Row>
        )}
        {applied && (
          <Row
            tone="saving"
            label={
              <span className="flex flex-wrap items-center gap-2">
                کد تخفیف
                <span
                  dir="ltr"
                  className="rounded-pill bg-sale/10 px-2 text-sm leading-6 font-bold text-sale"
                >
                  {coupon.code}
                </span>
              </span>
            }
          >
            {coupon.discount_type === 'free_shipping'
              ? 'ارسال رایگان'
              : formatToman(cart.coupon_discount)}
          </Row>
        )}
        {discounted && <Row label="جمع کالاها پس از تخفیف">{formatToman(cart.goods_payable)}</Row>}
        <Row label={'هزینه\u{0654} ارسال'} note={stale ? shipping.reason : null}>
          {shippingValue(cart)}
        </Row>
        {cart.packaging_cost > 0 && (
          <Row label={'هزینه\u{0654} بسته\u{200C}بندی'}>{formatToman(cart.packaging_cost)}</Row>
        )}
        {cart.shipping_discount > 0 && (
          <Row label="تخفیف ارسال" tone="saving">
            {formatToman(cart.shipping_discount)}
          </Row>
        )}
        {cart.cod_fee > 0 && (
          <Row label={'هزینه\u{0654} پرداخت در محل'}>{formatToman(cart.cod_fee)}</Row>
        )}
        <Row label="مالیات بر ارزش افزوده">{formatToman(cart.tax_amount)}</Row>
        <Row label="مبلغ کل" tone="total">
          {formatToman(cart.total)}
        </Row>
        {variant === 'checkout' ? (
          <CheckoutShares cart={cart} />
        ) : (
          <>
            {cart.amount_to_collect_on_delivery > 0 && (
              <>
                <Row label="پرداخت آنلاین">{formatToman(cart.amount_charged_online)}</Row>
                <Row label="پرداخت در محل">{formatToman(cart.amount_to_collect_on_delivery)}</Row>
              </>
            )}
            {cart.prepayment > 0 && (
              <Row label="بیعانه (در پرداخت آنلاین)">{formatToman(cart.prepayment)}</Row>
            )}
          </>
        )}
        {cart.total_savings > 0 && (
          <Row label="سود شما از این خرید" tone="saving">
            {formatToman(cart.total_savings)}
          </Row>
        )}
      </dl>
      {variant === 'cart' && !(shipping.is_selected && shipping.is_available) && (
        <p className="mt-2 text-sm leading-6 text-ink-600">{SHIPPING_NOTE}</p>
      )}
    </section>
  )
}
