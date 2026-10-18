import type { Paginated } from '@/lib/api/types/common'
import type { GatewayOption, PaymentHistoryItem, WalletBalance } from '@/lib/api/types/payment'
import type {
  PaymentHistoryFull,
  WalletTransaction,
  WithdrawalRequest,
} from '@/lib/api/types/wallet'
import walletFixture from '../../fixtures/wallet-balance.json'
import paymentPos from '../../fixtures/wallet-payment-pos.json'
import paymentTopUp from '../../fixtures/wallet-payment-topup.json'
import paymentsFixture from '../../fixtures/wallet-payments.json'
import refusalsFixture from '../../fixtures/wallet-refusals.json'
import transactionsFixture from '../../fixtures/wallet-transactions.json'
import withdrawalsFixture from '../../fixtures/wallet-withdrawals.json'
import gatewaysFixture from '../../fixtures/payment-gateways.json'

// shirin's live wallet answers (2026-10-18; uuids masked; tests/fixtures/wallet-*.json): her
// balance and limits, her ledger (top-up, order payments, a withdrawal and its reversal), her two
// withdrawals (paid, cancelled), her payments and two details, and the API's refusals of
// top-ups and withdrawals, captured live (no money moved).

const copy = <T>(value: unknown): T => structuredClone(value) as T

export const balance = (changes: Partial<WalletBalance> = {}): WalletBalance => ({
  ...copy<{ data: WalletBalance }>(walletFixture).data,
  ...changes,
})

export const transactions = () =>
  copy<{ data: Paginated<WalletTransaction> }>(transactionsFixture).data
export const withdrawals = () =>
  copy<{ data: Paginated<WithdrawalRequest> }>(withdrawalsFixture).data
export const payments = () => copy<{ data: Paginated<PaymentHistoryItem> }>(paymentsFixture).data
export const topUpDetail = () => copy<{ data: PaymentHistoryFull }>(paymentTopUp).data
export const posDetail = () => copy<{ data: PaymentHistoryFull }>(paymentPos).data
export const gateways = () => copy<{ data: Paginated<GatewayOption> }>(gatewaysFixture).data.results

type Refusal = { status: number; body: { data: unknown } }
/** A live refusal by its capture name (`topup-below`, `wd-iban-invalid`…). */
export const refusal = (name: keyof typeof refusalsFixture): Refusal =>
  copy<Record<string, Refusal>>(refusalsFixture)[name]!

export const withdrawal = (changes: Partial<WithdrawalRequest> = {}): WithdrawalRequest => ({
  ...withdrawals().results[0]!,
  ...changes,
})
