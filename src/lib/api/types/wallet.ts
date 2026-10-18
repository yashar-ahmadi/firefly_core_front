import type { Toman } from './cart'
import type { CardTransferReceipt, PaymentHistoryItem } from './payment'

/**
 * Wire types of the wallet's own endpoints (order digest §2, §3.3; `GET wallet/` is
 * `WalletBalance` in ./payment) and the payment history detail the wallet page shows in full
 * (§3.2.10), verified against live JSON (2026-10-18). Unknown enum values are possible (the
 * digest: treat them gracefully), so the string unions are open. Pure types.
 */

export type WalletDirection = 'credit' | 'debit'

export type WalletCause =
  | 'top_up'
  | 'order_payment'
  | 'order_payment_reversal'
  | 'refund'
  | 'amendment_credit'
  | 'withdrawal'
  | 'withdrawal_reversal'
  | 'admin_adjustment'

/** One row of `GET wallet/transaction/list/` (paginated): money that actually moved. */
export interface WalletTransaction {
  created: string
  direction: WalletDirection | string
  direction_display: string
  cause: WalletCause | string
  cause_display: string
  /** Always positive: the sign comes from `direction`. */
  amount: Toman
  /** The balance right after this row (never summed here). */
  balance_after: Toman
  /** "" or the operator's words («لغو توسط مشتری»). */
  reason: string
  order_code: string | null
  /** A bearer credential (the payment history detail's): never in a URL or a log. */
  payment_uuid: string | null
  withdrawal_uuid: string | null
}

export type WithdrawalStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'cancelled'

/** One cash-out (`GET wallet/withdrawal/list/`, the request's and the cancel's answers). */
export interface WithdrawalRequest {
  /** Owner-scoped (the API answers it to this account only). */
  uuid: string
  amount: Toman
  status: WithdrawalStatus | string
  status_display: string
  account_holder_name: string
  /** Normalised: «IR» and 24 digits. */
  iban: string
  /** 16 digits, or "". */
  card_number: string
  /** From the IBAN's bank code; "" when unknown. */
  bank_name: string
  rejection_reason: string
  reviewed_at: string | null
  paid_at: string | null
  payout_reference: string
  created: string
}

/** `POST wallet/withdrawal/request/`. */
export interface WithdrawalInput {
  amount: number
  /** At most 120 characters. */
  account_holder_name: string
  /** «IR» and 24 digits. */
  iban: string
  /** 16 digits, Luhn-valid; a cross-check only (left out when not given). */
  card_number?: string
}

/** `POST wallet/top-up/` (with an Idempotency-Key per click). */
export interface WalletTopUpInput {
  amount: number
  /** Omitted: the server's default gateway. */
  gateway_code?: string
}

/** A payment the shop recorded itself (a card reader, cash, a transfer). */
export interface ManualPayment {
  terminal_reference: string
  card_last_digits: string
  payout_reference: string
  received_at: string
}

/** `GET payment/history/<uuid>/` in full (the owner's; 404 otherwise). */
export interface PaymentHistoryFull extends PaymentHistoryItem {
  /** "" while nothing failed (digest §8.6 for the values). */
  failure_reason: string
  card_transfer_receipt: CardTransferReceipt | null
  manual_payment: ManualPayment | null
}
