'use client'

import type { QueryClient, UseQueryResult } from '@tanstack/react-query'
import { authApi } from '@/features/auth/api'
import type { TotpStatus, UserProfile } from '@/lib/api/types/account'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { useAccountQuery } from '../use-account-query'

/**
 * `GET account/profile/totp/status/`. Under `['me']`, so whatever drops the profile (a login, a
 * logout, a session that ended) drops it too.
 */
export const TOTP_STATUS_KEY = [...ME_KEY, 'totp'] as const

/** Whether two-step login is on, from its own endpoint (auth digest §4.19). */
export function useTotpStatus(): UseQueryResult<TotpStatus> {
  return useAccountQuery({
    queryKey: TOTP_STATUS_KEY,
    queryFn: ({ signal }) => authApi.totpStatus({ signal }),
  })
}

/** After an enable or a disable: the status and the profile's copy of it say so at once. */
export function setTotpEnabled(client: QueryClient, enabled: boolean): void {
  client.setQueryData<TotpStatus>(TOTP_STATUS_KEY, { is_totp_enabled: enabled })
  client.setQueryData<UserProfile | null>(ME_KEY, (me) =>
    me ? { ...me, is_totp_enabled: enabled } : me,
  )
}
