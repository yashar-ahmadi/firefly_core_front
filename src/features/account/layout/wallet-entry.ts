'use client'

import { useFeature } from '@/features/settings/feature-context'
import { useWithdrawalRecord } from '@/features/wallet/wallet-queries'
import { useSummary } from '../dashboard/use-summary'

// The way to the wallet page from the account's nav and the dashboard (Plan 4 final fix wave;
// rulings 144 and 149). With the `wallet` switch on: the usual row and card (`open`). With it
// off, the page still shows the balance, the ledger, the payment history and the withdrawals
// with an open request's «لغو درخواست» (wallet-access.ts): so both stay, worded for viewing
// (`view`), whenever the visitor has something there: a balance (the summary's, no request), or
// with none a withdrawal on record (one row of the wallet page's own record read; a pending
// withdrawal is one, its amount already out of the balance). Nothing there, or not known yet:
// neither (`none`), as before.

export type WalletEntry = 'open' | 'view' | 'none'

export function walletEntry({
  on,
  balance,
  hasRecord,
}: {
  on: boolean
  /** The summary's balance (undefined: not read yet). */
  balance: number | undefined
  /** A withdrawal on record (undefined: not asked, or no answer). */
  hasRecord: boolean | undefined
}): WalletEntry {
  if (on) return 'open'
  if (balance !== undefined && balance > 0) return 'view'
  return balance === 0 && hasRecord === true ? 'view' : 'none'
}

/** The wallet's entry for this visitor: the switch, the summary, and the record when needed. */
export function useWalletEntry(): WalletEntry {
  const on = useFeature('wallet').enabled
  const balance = useSummary().data?.wallet.balance
  // Asked only with the switch off and no balance to say it: shared by the nav and the card.
  const record = useWithdrawalRecord(!on && balance === 0)
  return walletEntry({ on, balance, hasRecord: record.data ? record.data.count > 0 : undefined })
}
