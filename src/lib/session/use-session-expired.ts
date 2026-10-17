'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { loginHref } from '@/lib/links/login'
import { useSession } from './session-context'
import { clearViewerQueries, ME_KEY } from './viewer-queries'

export interface SessionExpiredOptions {
  /** The visitor was doing something that needs a session (a heart, a review): log in now. */
  toLogin?: boolean
}

/** Call it when a session-only call answered `isSessionExpiredError`. */
export type SessionExpired = (options?: SessionExpiredOptions) => void

/** Pages that are nothing without a session: the account area (ruling P3-R1). */
const SESSION_PAGE = /^\/account(?:\/|$)/

/**
 * What a session-only call does when it answers 401 because the session is gone (it expired,
 * was revoked, or ended in another tab; the BFF has dropped the cookies by then):
 *
 * - the page stops acting signed in: `hasSession` turns false, which disables every
 *   session-only query, so nothing asks again (no loop, and no re-request per mounted heart);
 * - what this visitor saw is dropped (`clearViewerQueries`) and the profile is known to be
 *   nobody (`['me']` is null);
 * - on a page that needs a session (the account area), login replaces it, with the page as
 *   `next`; after an action of the visitor (`toLogin`), login is pushed. A background read on a
 *   public page (the hearts' wishlist ids, the header's name) only turns the page into its guest
 *   version: nobody asked to log in.
 *
 * Stable across renders. Only the first call for a session does the above (`endSession`): when
 * several session calls fail at once, each calls this before React re-renders, and a second run
 * would read the page again and replace it twice. A later call for an action still goes to
 * login (replaced on an account page, pushed elsewhere).
 */
export function useSessionExpired(): SessionExpired {
  const { endSession } = useSession()
  const client = useQueryClient()
  const router = useRouter()
  return useCallback(
    ({ toLogin = false } = {}) => {
      const first = endSession()
      if (first) {
        void clearViewerQueries(client)
        client.setQueryData(ME_KEY, null)
      }
      const { pathname, search } = window.location
      const login = loginHref(`${pathname}${search}`)
      // A background read that finds the session over already says nothing new; an action that
      // needs one does, even then (the flag cookie and the session cookie can disagree).
      if (SESSION_PAGE.test(pathname)) {
        if (first || toLogin) router.replace(login)
      } else if (toLogin) router.push(login)
    },
    [client, router, endSession],
  )
}
