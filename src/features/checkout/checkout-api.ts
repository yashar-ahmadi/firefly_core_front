import { bffFetch } from '@/lib/api/client'
import type { Cart } from '@/lib/api/types/cart'
import type {
  DestinationRequest,
  ShippingOptionList,
  ShippingSelectionRequest,
} from '@/lib/api/types/shipping'

// The checkout's cart endpoints (cart digest §3.8–3.10), through the BFF like every cart call:
// it sends the guest's cart token or the session. Checkout only (ruling P4-R1): nothing the
// mini-cart or the catalog loads imports this. Each write answers with the whole priced cart.

export const checkoutApi = {
  /** `POST cart/destination/`: clears the shipping choice and COD (even the same destination). */
  destination: async (body: DestinationRequest): Promise<Cart> =>
    (await bffFetch<Cart>('cart/destination/', { method: 'POST', body })).data,

  /** `GET cart/shipping/option/list/`: every active method, the unavailable ones with a reason. */
  shippingOptions: async (signal?: AbortSignal): Promise<ShippingOptionList> =>
    (await bffFetch<ShippingOptionList>('cart/shipping/option/list/', { signal })).data,

  /** `POST cart/shipping/select/`: the server prices it again itself. */
  selectShipping: async (body: Required<ShippingSelectionRequest>): Promise<Cart> =>
    (await bffFetch<Cart>('cart/shipping/select/', { method: 'POST', body })).data,
}
