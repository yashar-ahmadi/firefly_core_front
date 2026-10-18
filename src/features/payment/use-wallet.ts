'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { WalletBalance } from '@/lib/api/types/payment'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { WALLET_KEY } from '@/lib/session/viewer-queries'
import { withSessionExpiry } from '@/lib/session/with-session-expiry'
import { paymentApi } from './reads'

// The signed-in shopper's wallet for the payment step (order digest §3.3.1, §5.3): `GET wallet/`
// through the BFF, only with a session, under `WALLET_KEY` (SESSION_QUERIES: a logout removes
// it). Read again after a wallet refusal (`wallet_insufficient_funds`, `wallet_frozen`) and after
// a payment that moved wallet money. A session that ends here ends it (`useSessionExpired`).

export const WALLET_BALANCE_KEY = [...WALLET_KEY, 'balance'] as const

export function useWalletBalance(wanted: boolean): UseQueryResult<WalletBalance> {
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  const read = withSessionExpiry(
    ({ signal }: { signal: AbortSignal }) => paymentApi.wallet(signal),
    expire,
  )
  return useQuery({
    queryKey: WALLET_BALANCE_KEY,
    queryFn: ({ signal }) => read({ signal }),
    enabled: hasSession && wanted,
    // Live money: read on mount, never served stale.
    staleTime: 0,
  })
}
