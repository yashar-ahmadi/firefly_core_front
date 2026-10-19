import { bffFetch } from '@/lib/api/client'
import type { QueryInit } from '@/lib/api/envelope'
import type { Paginated } from '@/lib/api/types/common'
import type { PaymentHistoryItem, PaymentIntent } from '@/lib/api/types/payment'
import type {
  PaymentHistoryFull,
  WalletTopUpInput,
  WalletTransaction,
  WithdrawalInput,
  WithdrawalRequest,
} from '@/lib/api/types/wallet'
import { WALLET_KEY } from '@/lib/session/viewer-queries'
import { bankUrl, UnsafeHandoffError } from '@/features/payment/handoff-url'

// The wallet page's calls through the BFF, with the session only (order digest §3.2.9–3.2.10,
// §3.3), every key under `WALLET_KEY` (SESSION_QUERIES: a login or a logout removes them; the
// balance's own key is `WALLET_BALANCE_KEY`, shared with the checkout's payment step). A payment
// uuid is a bearer credential: in a path and this tab's memory only, never in a URL or a log.

export type LedgerPage = Paginated<WalletTransaction>
export type WithdrawalsPage = Paginated<WithdrawalRequest>
export type PaymentsPage = Paginated<PaymentHistoryItem>

export const LEDGER_KEY = [...WALLET_KEY, 'transactions'] as const
export const WITHDRAWALS_KEY = [...WALLET_KEY, 'withdrawals'] as const
/** The one open request (requested or approved), whatever the list's filters. */
export const OPEN_WITHDRAWAL_KEY = [...WITHDRAWALS_KEY, 'open'] as const
export const PAYMENTS_KEY = [...WALLET_KEY, 'payments'] as const

export const ledgerKey = (query: QueryInit) => [...LEDGER_KEY, query] as const
export const withdrawalsKey = (query: QueryInit) => [...WITHDRAWALS_KEY, query] as const
export const paymentsKey = (query: QueryInit) => [...PAYMENTS_KEY, query] as const
export const paymentKey = (uuid: string) => [...WALLET_KEY, 'payment', uuid] as const

export async function fetchLedger(query: QueryInit, signal?: AbortSignal): Promise<LedgerPage> {
  return (await bffFetch<LedgerPage>('wallet/transaction/list/', { query, signal })).data
}

export async function fetchWithdrawals(
  query: QueryInit,
  signal?: AbortSignal,
): Promise<WithdrawalsPage> {
  return (await bffFetch<WithdrawalsPage>('wallet/withdrawal/list/', { query, signal })).data
}

/** The open request, if any (one at a time: `requested` or `approved`, §7). */
export async function fetchOpenWithdrawal(signal?: AbortSignal): Promise<WithdrawalRequest | null> {
  const page = await fetchWithdrawals({ status: ['requested', 'approved'], limit: 1 }, signal)
  return page.results[0] ?? null
}

export async function fetchPayments(query: QueryInit, signal?: AbortSignal): Promise<PaymentsPage> {
  return (await bffFetch<PaymentsPage>('payment/history/', { query, signal })).data
}

/** `GET payment/history/<uuid>/`: 404 `not_found` when it is not this account's. */
export async function fetchPayment(
  uuid: string,
  signal?: AbortSignal,
): Promise<PaymentHistoryFull> {
  return (await bffFetch<PaymentHistoryFull>(`payment/history/${uuid}/`, { signal })).data
}

/**
 * `POST wallet/top-up/` with the click's Idempotency-Key: 201 → the attempt and its handoff. A
 * handoff that leads to no bank's page (`bankUrl`) throws `UnsafeHandoffError` (the box says the
 * bank did not answer: top-up-refusal.ts).
 */
export async function postTopUp(input: WalletTopUpInput, key: string): Promise<PaymentIntent> {
  const intent = (
    await bffFetch<PaymentIntent>('wallet/top-up/', {
      method: 'POST',
      body: input,
      idempotencyKey: key,
    })
  ).data
  if (intent.handoff && !bankUrl(intent.handoff.url)) throw new UnsafeHandoffError()
  return intent
}

/** `POST wallet/withdrawal/request/`: 201 → the request (the money left the balance now). */
export async function postWithdrawal(input: WithdrawalInput): Promise<WithdrawalRequest> {
  return (await bffFetch<WithdrawalRequest>('wallet/withdrawal/request/', { body: input })).data
}

/** `POST wallet/withdrawal/<uuid>/cancel/`: 200 → cancelled, the money back at once. */
export async function postWithdrawalCancel(uuid: string): Promise<WithdrawalRequest> {
  return (
    await bffFetch<WithdrawalRequest>(`wallet/withdrawal/${uuid}/cancel/`, { method: 'POST' })
  ).data
}
