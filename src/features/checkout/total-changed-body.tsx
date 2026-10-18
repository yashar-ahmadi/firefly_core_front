import type { Cart } from '@/lib/api/types/cart'
import { formatToman } from '@/lib/format'

// What the "total changed" dialog says (total-changed-dialog.tsx), kept apart so the page's own
// fallback can say it without the dialog's code (loaded on the refusal only).

export interface TotalChangedProps {
  /** The cart as the API priced it again. */
  cart: Cart
  /** What the shopper had confirmed. */
  previous: number
  /** Every step is still done for this cart: placing at its total can be offered. */
  canConfirm: boolean
  onReview: () => void
  onConfirm: (total: number) => void
}

export function TotalChangedBody({ cart, previous }: Pick<TotalChangedProps, 'cart' | 'previous'>) {
  return (
    <div className="flex flex-col gap-2 text-base leading-7 text-ink-800">
      <p>
        {`مبلغ سفارش از ${formatToman(previous)} به `}
        <strong className="font-bold text-ink-900">{formatToman(cart.total)}</strong>
        {' تغییر کرد.'}
      </p>
      {cart.shipping.is_selected && cart.shipping.is_available && (
        <dl className="flex flex-col gap-1">
          <div className="flex justify-between gap-4">
            <dt>پرداخت آنلاین</dt>
            <dd className="font-medium tabular-nums">{formatToman(cart.amount_charged_online)}</dd>
          </div>
          {cart.amount_to_collect_on_delivery > 0 && (
            <div className="flex justify-between gap-4">
              <dt>پرداخت هنگام تحویل</dt>
              <dd className="font-medium tabular-nums">
                {formatToman(cart.amount_to_collect_on_delivery)}
              </dd>
            </div>
          )}
        </dl>
      )}
      <p className="text-ink-700">
        {
          'قیمت\u{200C}ها یا هزینه\u{0654} ارسال از آخرین بازبینی شما تغییر کرده است. اطلاعات گیرنده و توضیحات شما حفظ شده\u{200C}اند.'
        }
      </p>
    </div>
  )
}
