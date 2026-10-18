import type { Toman } from './cart'

/**
 * Wire types of the payment and wallet endpoints the checkout uses (`payment/method/list/`,
 * `payment/gateway/list/`, both intent doors, `wallet/`), copied from the order digest §2
 * (docs/backend-integration/order-payment.md), verified against live JSON (2026-10-18). Pure
 * types: safe in any bundle. A payment uuid and a link token are bearer credentials: never log
 * them or send them anywhere but the API (digest §1.3).
 */

export type PaymentRoute =
  'bank_gateway' | 'wallet' | 'wallet_and_gateway' | 'card_transfer' | 'pay_on_delivery'

/** The instrument a payment row actually used. */
export type PaymentMethodName =
  | 'bank_gateway'
  | 'wallet'
  | 'card_transfer'
  | 'pay_on_delivery'
  | 'pos'
  | 'cash'
  | 'manual_transfer'

export type PaymentStatus =
  'pending' | 'awaiting_review' | 'settled' | 'failed' | 'cancelled' | 'refunded'

/** One route of `payment/method/list/` (paginated: `data.results`), in `display_order`. */
export interface PaymentMethodOption {
  route: PaymentRoute
  label: string
  /** Operator text (plain in the dev data); rendered sanitised on the server. */
  description: string
  /** Operator HTML or "". */
  instruction: string
  /** A URL, maybe relative (`/static/defaults/default.png` when none). */
  icon: string
  /** The route's ceiling, compared by the server with the online amount (the door's for COD). */
  max_amount: Toman | null
  /** Wallet routes: a guest cannot use them. */
  requires_authentication: boolean
  display_order: number
  /** false: a feature switch closed it; `reason` says why (Persian). */
  is_available: boolean
  reason: string | null
}

/** One gateway of `payment/gateway/list/` (paginated). */
export interface GatewayOption {
  code: string
  title: string
  /** Relative URLs; `logo_thumbnail` may be the default placeholder. */
  logo: string | null
  logo_thumbnail: string | null
  is_default: boolean
  minimum_amount: Toman
  /** null: no ceiling. */
  maximum_amount: Toman | null
}

/** A payment row as the status endpoint and the intents show it. */
export interface PaymentStatusInfo {
  uuid: string
  applies_to: 'online_charge' | 'delivery_collection' | 'wallet_topup' | 'refund_out'
  method: PaymentMethodName
  status: PaymentStatus
  amount: Toman
  order_code: string | null
  /** "" while nothing failed. */
  failure_reason: string
  settled_at: string | null
}

/** How the browser goes to the bank (digest §5.4): a GET with query params, or a POSTed form. */
export interface RedirectPayload {
  gateway_code: string
  gateway_title: string
  /** https. */
  url: string
  method: 'GET' | 'POST'
  params: Record<string, string>
  /** The handoff's lifetime (15 minutes by default); after it the bank refuses it. */
  expires_at: string | null
}

export interface BankCard {
  id: number
  holder_name: string
  bank_name: string
  bank_logo_thumbnail: string | null
  card_number: string
  sheba: string
  account_number: string
}

/** The answer of both intent doors (always 201, a replay too). */
export interface PaymentIntent {
  /** null only for a free order confirmed with `pay_on_delivery`. */
  payment: PaymentStatusInfo | null
  status: PaymentStatus | null
  /** bank_gateway and wallet_and_gateway. */
  handoff: RedirectPayload | null
  /** card_transfer only ([] on a key replay: read them again from `card-transfer/`). */
  destination_cards: BankCard[]
  delivery_collection: PaymentStatusInfo | null
}

/** `data.open_attempt` of a 409 `payment_attempt_open` (and of the link page). */
export interface OpenAttempt {
  payment: string
  method: PaymentMethodName
  status: PaymentStatus
  amount: Toman
  /** null: the bank answered, verification is running. */
  expires_at: string | null
  handoff: RedirectPayload | null
  destination_cards: BankCard[]
}

/** `POST payment/order/<uuid>/intent/` and `payment/link/<token>/intent/`. */
export interface PaymentIntentRequest {
  route: PaymentRoute
  /** Read only for bank_gateway and wallet_and_gateway; omitted: the server's default. */
  gateway_code?: string
}

/** `GET wallet/` (never creates a wallet: a zero balance when there is none). */
export interface WalletBalance {
  balance: Toman
  is_frozen: boolean
  /** Plain text, non-empty exactly when frozen. */
  freeze_message: string | null
  is_top_up_enabled: boolean
  minimum_top_up_amount: Toman
  maximum_top_up_amount: Toman
  daily_top_up_limit: Toman
  remaining_daily_top_up: Toman
  is_withdrawal_enabled: boolean
  minimum_withdrawal_amount: Toman
  withdrawal_processing_days: number
  /** Already deducted from `balance`. */
  pending_withdrawal_amount: Toman
}
