'use client'

import { useCallback, type Dispatch } from 'react'
import {
  useRequestRunner,
  type Run,
  type RunnerAction,
  type Settle,
} from '@/features/auth/components/use-request-runner'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'

/** A request that answered "the session is gone". */
const EXPIRED = Symbol('session expired')

/**
 * `useRequestRunner` for the profile's writes, which all need a session. A 401 that means the
 * session is gone (`isSessionExpiredError`: the BFF's one refresh failed) is no mistake of the
 * form: it ends the session as every session call does (`useSessionExpired`: the visitor's data
 * goes, login replaces the page with it as `next`), and the form stays locked while the page
 * changes (`'leaving'`). Any other failure goes to `toFailure` as usual.
 */
export function useProfileRunner<F>(
  dispatch: Dispatch<RunnerAction<F>>,
  toFailure: (error: unknown) => F,
): Run {
  const run = useRequestRunner(dispatch, toFailure)
  const expire = useSessionExpired()
  return useCallback(
    <T>(request: () => Promise<T>, settle: Settle<T>, sending?: boolean) => {
      run<{ value: T } | typeof EXPIRED>(
        async () => {
          try {
            return { value: await request() }
          } catch (error) {
            if (!isSessionExpiredError(error)) throw error
            expire({ toLogin: true })
            return EXPIRED
          }
        },
        (result) => (result === EXPIRED ? 'leaving' : settle(result.value)),
        sending,
      )
    },
    [run, expire],
  )
}
