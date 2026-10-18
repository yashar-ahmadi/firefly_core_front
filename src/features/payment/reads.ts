import { bffFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types/common'
import type { GatewayOption, PaymentMethodOption, WalletBalance } from '@/lib/api/types/payment'

// The payment reads the checkout makes in the browser through the BFF (order digest §3.2.1–
// 3.2.2, §3.3.1): the lists only after a refusal says the server's cached copy is out of date
// (they share the 240/h `payment_status` budget), the wallet's balance for a signed-in shopper.
// Kept apart from the intents (./api), which load only once an order exists.

export const paymentApi = {
  /** `GET payment/method/list/` (after a refusal only: the page has the server's cached copy). */
  methods: async (): Promise<PaymentMethodOption[]> =>
    (await bffFetch<Paginated<PaymentMethodOption>>('payment/method/list/')).data.results,
  /** `GET payment/gateway/list/` (after a `gateway_*` refusal only). */
  gateways: async (): Promise<GatewayOption[]> =>
    (await bffFetch<Paginated<GatewayOption>>('payment/gateway/list/')).data.results,
  /** `GET wallet/` (signed in). */
  wallet: async (signal?: AbortSignal): Promise<WalletBalance> =>
    (await bffFetch<WalletBalance>('wallet/', { signal })).data,
}
