'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import { useFeature } from '@/features/settings/feature-context'
import { useWithdrawalRecord } from '@/features/wallet/withdrawal-record'
import { useSummary } from '../dashboard/use-summary'
import { isLoadingSection } from '../use-account-query'

// The way to the wallet page from the account's nav and the dashboard (Plan 4 final fix wave;
// rulings 144 and 149). With the `wallet` switch on: the usual row and card (`open`). With it
// off, the page still shows the balance, the ledger, the payment history and the withdrawals
// with an open request's «لغو درخواست» (wallet-access.ts): so both stay, worded for viewing
// (`view`), whenever the visitor has something there: a balance (the summary's, no request), or
// with none a withdrawal on record (one row of the wallet page's own record read; a pending
// withdrawal is one, its amount already out of the balance). Nothing there, or no answer:
// neither (`none`), as before. While that is being read (`pending`) the nav and the card hold
// the place with a hidden placeholder of their size, so nothing below them moves when they come.

export type WalletEntry = 'open' | 'view' | 'none' | 'pending'

export function walletEntry({
  on,
  balance,
  hasRecord,
}: {
  on: boolean
  /** The summary's balance (`pending`: being read; undefined: no answer). */
  balance: number | 'pending' | undefined
  /** A withdrawal on record (`pending`: being asked; undefined: not asked, or no answer). */
  hasRecord: boolean | 'pending' | undefined
}): WalletEntry {
  if (on) return 'open'
  if (balance === 'pending') return 'pending'
  if (balance === undefined) return 'none'
  if (balance > 0) return 'view'
  if (hasRecord === 'pending') return 'pending'
  return hasRecord === true ? 'view' : 'none'
}

/** A read's answer: `pending` while it is being read, undefined when it has none. */
function answerOf<D, T>(query: UseQueryResult<D>, read: (data: D) => T): T | 'pending' | undefined {
  if (query.data !== undefined) return read(query.data)
  return isLoadingSection(query) ? 'pending' : undefined
}

/** The wallet's entry for this visitor: the switch, the summary, and the record when needed. */
export function useWalletEntry(): WalletEntry {
  const on = useFeature('wallet').enabled
  const balance = answerOf(useSummary(), (summary) => summary.wallet.balance)
  // Asked only with the switch off and no balance to say it: shared by the nav and the card.
  const record = useWithdrawalRecord(!on && balance === 0)
  return walletEntry({ on, balance, hasRecord: answerOf(record, (page) => page.count > 0) })
}
