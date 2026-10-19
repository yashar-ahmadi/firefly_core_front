'use client'

import { keepPreviousData, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useAccountQuery } from '@/features/account/use-account-query'
import { paymentApi } from '@/features/payment/reads'
import { WALLET_BALANCE_KEY } from '@/features/payment/use-wallet'
import type { QueryInit } from '@/lib/api/envelope'
import type { WalletBalance } from '@/lib/api/types/payment'
import type { PaymentHistoryFull, WithdrawalRequest } from '@/lib/api/types/wallet'
import { SUMMARY_KEY, WALLET_KEY } from '@/lib/session/viewer-queries'
import {
  fetchLedger,
  fetchOpenWithdrawal,
  fetchPayment,
  fetchPayments,
  fetchWithdrawals,
  ledgerKey,
  OPEN_WITHDRAWAL_KEY,
  paymentKey,
  paymentsKey,
  withdrawalsKey,
  type LedgerPage,
  type PaymentsPage,
  type WithdrawalsPage,
} from './api'

// The wallet page's reads (`useAccountQuery`: only with a session; a 401 that ends it ends the
// page). Lists keep the page on screen while the next one loads.

/** `GET wallet/`: the balance, its state and the shop's limits. */
export function useWallet(): UseQueryResult<WalletBalance> {
  return useAccountQuery({
    queryKey: WALLET_BALANCE_KEY,
    queryFn: ({ signal }) => paymentApi.wallet(signal),
  })
}

export function useLedger(query: QueryInit): UseQueryResult<LedgerPage> {
  return useAccountQuery({
    queryKey: ledgerKey(query),
    queryFn: ({ signal }) => fetchLedger(query, signal),
    placeholderData: keepPreviousData,
  })
}

export function useWithdrawals(query: QueryInit, enabled = true): UseQueryResult<WithdrawalsPage> {
  return useAccountQuery({
    queryKey: withdrawalsKey(query),
    queryFn: ({ signal }) => fetchWithdrawals(query, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useOpenWithdrawal(enabled = true): UseQueryResult<WithdrawalRequest | null> {
  return useAccountQuery({
    queryKey: OPEN_WITHDRAWAL_KEY,
    queryFn: ({ signal }) => fetchOpenWithdrawal(signal),
    enabled,
  })
}

export function usePayments(query: QueryInit): UseQueryResult<PaymentsPage> {
  return useAccountQuery({
    queryKey: paymentsKey(query),
    queryFn: ({ signal }) => fetchPayments(query, signal),
    placeholderData: keepPreviousData,
  })
}

export function usePayment(uuid: string): UseQueryResult<PaymentHistoryFull> {
  return useAccountQuery({
    queryKey: paymentKey(uuid),
    queryFn: ({ signal }) => fetchPayment(uuid, signal),
  })
}

/**
 * Money moved (a withdrawal filed or cancelled): the balance, the ledger, the withdrawals and
 * the payments are read again, and the summary (its wallet card and badge).
 */
export function walletChanged(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: WALLET_KEY })
  void client.invalidateQueries({ queryKey: SUMMARY_KEY })
}
