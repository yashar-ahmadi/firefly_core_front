'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import { useAccountQuery } from '@/features/account/use-account-query'
import { bffFetch } from '@/lib/api/client'
import type { QueryInit } from '@/lib/api/envelope'
import type { Paginated } from '@/lib/api/types/common'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import { WALLET_KEY } from '@/lib/session/viewer-queries'

// The withdrawal list's read and key (`GET wallet/withdrawal/list/`, with the session only), and
// its first row as a record (any status) of whether the visitor has a withdrawal at all: asked
// while the `wallet` switch is off by the wallet page (its withdrawals tab) and by the account's
// nav and dashboard (their way to the page, wallet-entry.ts), one read for all three. Kept apart
// from api.ts so the account shell carries only this.

export type WithdrawalsPage = Paginated<WithdrawalRequest>

export const WITHDRAWALS_KEY = [...WALLET_KEY, 'withdrawals'] as const
export const withdrawalsKey = (query: QueryInit) => [...WITHDRAWALS_KEY, query] as const

export async function fetchWithdrawals(
  query: QueryInit,
  signal?: AbortSignal,
): Promise<WithdrawalsPage> {
  return (await bffFetch<WithdrawalsPage>('wallet/withdrawal/list/', { query, signal })).data
}

/** One row (any status) is enough. */
const RECORD = { limit: 1 }

export function useWithdrawalRecord(enabled: boolean): UseQueryResult<WithdrawalsPage> {
  return useAccountQuery({
    queryKey: withdrawalsKey(RECORD),
    queryFn: ({ signal }) => fetchWithdrawals(RECORD, signal),
    enabled,
  })
}
