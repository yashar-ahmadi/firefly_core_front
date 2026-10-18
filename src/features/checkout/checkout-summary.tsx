import { ChevronDown } from 'lucide-react'
import { CartSummary } from '@/features/cart/components/cart-summary'
import type { Cart } from '@/lib/api/types/cart'
import { formatToman } from '@/lib/format'

// The order's summary at the checkout (cart digest §5.3): the cart page's own summary
// (`variant="checkout"`), every amount one of the cart's fields. From lg it sits at the end,
// sticky; on phones and tablets it is folded at the top, sticky too, under «جمع کل: …» (the
// cart's `total`) and «مشاهدهٔ جزئیات». Only one of the two is ever displayed.

const CARD = 'rounded-card bg-white shadow-card'

export function CheckoutSummaryAside({ cart }: { cart: Cart }) {
  return (
    <aside className="hidden lg:sticky lg:top-4 lg:block">
      <CartSummary cart={cart} variant="checkout" className={`${CARD} p-5`} />
    </aside>
  )
}

export function CheckoutSummaryFolded({ cart }: { cart: Cart }) {
  return (
    <details
      data-summary="phone"
      className={`group sticky top-0 z-30 ${CARD} shadow-raised lg:hidden`}
    >
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-2 text-base [&::-webkit-details-marker]:hidden">
        <span className="font-bold whitespace-nowrap text-ink-900 tabular-nums">{`جمع کل: ${formatToman(cart.total)}`}</span>
        <span className="flex items-center gap-1 text-sm font-medium whitespace-nowrap text-brand-700">
          {'مشاهده\u{0654} جزئیات'}
          <ChevronDown
            aria-hidden
            className="size-5 group-open:rotate-180 motion-safe:transition-transform"
          />
        </span>
      </summary>
      <div className="max-h-[70dvh] overflow-y-auto border-t border-ink-100 px-4 pb-4">
        <CartSummary cart={cart} variant="checkout" className="pt-3" />
      </div>
    </details>
  )
}
