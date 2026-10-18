import type { PaymentCatalog, PaymentMethodView } from '@/features/payment/catalog'
import type { Cart } from '@/lib/api/types/cart'
import type { Paginated } from '@/lib/api/types/common'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import type {
  GatewayOption,
  PaymentIntent,
  PaymentMethodOption,
  RedirectPayload,
  WalletBalance,
} from '@/lib/api/types/payment'
import gatewayList from '../../fixtures/payment-gateways.json'
import methodList from '../../fixtures/payment-methods.json'
import placed from '../../fixtures/order-place-201.json'

// Captured live from the dev API (2026-10-18; a guest cart, never an account): the method list
// (bank, wallet, wallet+gateway, card transfer max 50,000,000, COD max 20,000,000), the gateway
// list (ZARINPAL default min 10,000; ZIBAL min 10,000 max 500,000,000) and a guest placement
// (order 5592580094, cancelled right after through its link). The intents' 201 bodies cannot be
// had in dev (no gateway works there, and wallet and COD confirmations cannot be undone): they
// follow the digest's types (§2).

const copy = <T>(value: unknown): T => structuredClone(value) as T

export const methods = (): PaymentMethodOption[] =>
  copy<{ data: Paginated<PaymentMethodOption> }>(methodList).data.results
export const method = (
  route: PaymentMethodOption['route'],
  changes: Partial<PaymentMethodOption> = {},
): PaymentMethodOption => ({ ...methods().find((item) => item.route === route)!, ...changes })
export const gateways = (): GatewayOption[] =>
  copy<{ data: Paginated<GatewayOption> }>(gatewayList).data.results

/** The guest placement: total 1,049,000, all online (A), nothing at the door. */
export const placement = (changes: Partial<OrderPlacementResult> = {}): OrderPlacementResult => ({
  ...copy<{ data: OrderPlacementResult }>(placed).data,
  ...changes,
})
export const LINK_TOKEN = 'ubiClbz6wHu1G-pJ9F98soBsfDqrITpZULlnO_4bi3U'

export const FEATURES_ON = {
  online_payment: { enabled: true, reason: null },
  wallet: { enabled: true, reason: null },
  pay_on_delivery: { enabled: true, reason: null },
}

export function wallet(changes: Partial<WalletBalance> = {}): WalletBalance {
  return {
    balance: 45_170_000,
    is_frozen: false,
    freeze_message: null,
    is_top_up_enabled: true,
    minimum_top_up_amount: 50_000,
    maximum_top_up_amount: 50_000_000,
    daily_top_up_limit: 100_000_000,
    remaining_daily_top_up: 100_000_000,
    is_withdrawal_enabled: true,
    minimum_withdrawal_amount: 200_000,
    withdrawal_processing_days: 3,
    pending_withdrawal_amount: 0,
    ...changes,
  }
}

/** A live handoff: 15 minutes from when the tests started (one value, so answers compare). */
const HANDOFF_EXPIRES = new Date(Date.now() + 15 * 60_000).toISOString()

export const handoff = (changes: Partial<RedirectPayload> = {}): RedirectPayload => ({
  gateway_code: 'ZARINPAL',
  gateway_title: 'زرین پال',
  url: 'https://bank.example/pay',
  method: 'GET',
  params: { Authority: 'A0000123' },
  expires_at: HANDOFF_EXPIRES,
  ...changes,
})

export const PAYMENT_UUID = '0b6f5a9e-3c1d-4f7a-9e2b-1a2b3c4d5e6f'

/** A 201 of an intent (digest §2 `PaymentIntent`). */
export function intent(
  route: 'bank_gateway' | 'wallet' | 'wallet_and_gateway' | 'card_transfer' | 'pay_on_delivery',
  changes: Partial<PaymentIntent> = {},
): PaymentIntent {
  const settled = route === 'wallet'
  return {
    payment: {
      uuid: PAYMENT_UUID,
      applies_to: route === 'pay_on_delivery' ? 'delivery_collection' : 'online_charge',
      method: route === 'wallet_and_gateway' ? 'bank_gateway' : route,
      status: settled ? 'settled' : 'pending',
      amount: 1_049_000,
      order_code: '5592580094',
      failure_reason: '',
      settled_at: settled ? '2026-10-18T05:40:00+03:30' : null,
    },
    status: settled ? 'settled' : 'pending',
    handoff: route === 'bank_gateway' || route === 'wallet_and_gateway' ? handoff() : null,
    destination_cards: [],
    delivery_collection: null,
    ...changes,
  }
}

/** A cart amount pair as the routes read it. */
export const amounts = (
  cart: Pick<Cart, 'amount_charged_online' | 'amount_to_collect_on_delivery'>,
) => ({
  online: cart.amount_charged_online,
  onDelivery: cart.amount_to_collect_on_delivery,
})

/** The live method list as the server hands it over (its plain texts are safe as they are). */
export const methodViews = (): PaymentMethodView[] =>
  methods().map((item) => ({
    ...item,
    description: item.description || null,
    instruction: item.instruction || null,
  }))

/** The checkout's payment catalog (the server's cached lists). */
export const catalog = (changes: Partial<PaymentCatalog> = {}): PaymentCatalog => ({
  methods: methodViews(),
  gateways: gateways(),
  ...changes,
})

/** The live settings' checkout sentences. */
export const TERMS = {
  accept: 'با ثبت سفارش، قوانین و مقررات فروشگاه را می پذیرم.',
  legalAge: 'تایید می کنم که سن قانونی برای خرید را دارم.',
}
export const NO_TERMS = { accept: null, legalAge: null }

/** What `/checkout/` hands the page. */
export const checkoutProps = (changes: Partial<{ catalog: PaymentCatalog }> = {}) => ({
  catalog: catalog(),
  terms: NO_TERMS,
  supportPhone: '+982191000000',
  ...changes,
})
