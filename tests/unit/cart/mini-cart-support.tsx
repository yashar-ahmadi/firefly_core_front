import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { CART_KEY } from '@/features/cart/hooks'
import { FeatureProvider } from '@/features/settings/feature-context'
import type { Cart } from '@/lib/api/types/cart'
import { clientProviders } from '../support/providers'
import { cart, cartLine, result } from './support'

// What the header's cart tests share (header-cart.test.tsx: the badge and the header's cart
// link; mini-cart.test.tsx: the sheet).

export const VIEW_CART = 'مشاهده\u{0654} سبد خرید'
export const SUMMARY_NOTE =
  'هزینه\u{0654} ارسال و مالیات در مرحله\u{0654} بعد محاسبه می\u{200C}شود.'

/** Answers every cart read with `data`. */
export function serveCart(bffFetch: Mock, data: Cart) {
  bffFetch.mockImplementation(() => Promise.resolve(result(data)))
}

export function renderWith(ui: ReactNode, cached?: Cart) {
  const { client, wrapper: Wrapper } = clientProviders()
  if (cached) client.setQueryData(CART_KEY, cached)
  const utils = render(
    <FeatureProvider initial={{}}>
      <Wrapper>{ui}</Wrapper>
    </FeatureProvider>,
  )
  return { ...utils, client }
}

export const TWO_LINES = cart(
  [
    cartLine({ quantity: 2 }),
    cartLine({
      variant_id: 10062,
      product_id: 10062,
      product_name: 'تلویزیون هایسنس ۵۵ اینچ U7',
      product_slug: 'hisense-tv-55-u7',
      variant_name: null,
      unit_final_price: 71_500_000,
    }),
  ],
  // Not the sum of the lines: the mini-cart shows the API's figure as it is. `total` (with tax)
  // is not shown before checkout.
  { goods_payable: 123_456_789, total: 987_654_321 },
)
