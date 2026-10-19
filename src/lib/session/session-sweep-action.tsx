'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent } from 'react'
import { clearReceiverDraft } from '@/features/checkout/receiver-draft'
import { abandonPushWork } from '@/features/push/push-storage'
import { isSignedInContextPath } from '@/lib/edge/account-guard'
import { loginHref } from '@/lib/links/login'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import { flagCookieValue } from './flag-cookie'
import { useSession } from './session-context'
import { useSessionExpired } from './use-session-expired'
import { clearViewerQueries, resetViewerQueries } from './viewer-queries'

/** Pages that load again after a switch: the signed-in context, and the payment pages. */
const reloadsOnSwitch = (pathname: string) =>
  isSignedInContextPath(pathname) || pathname.startsWith('/payment/')

/**
 * Sets this tab right against the session flag cookie (`ff_auth`, the marker of the login the
 * session began with), once, when it mounts (the shop-wide sweep mounts it when a tab coming back
 * finds something to set right; an account page's watch when the page mounts):
 *
 * - a session here, no cookie (a logout elsewhere, or the session ended): it ends here as when a
 *   read answers 401 (`useSessionExpired`: the guest version of a public page, login on an
 *   account page or a signed-in checkout);
 * - a session here, another login's marker (a logout and a login elsewhere): this tab's push
 *   steps stop, and the new session is this tab's; an account or checkout page loads again (its
 *   HTML is the visitor's own), and so does a payment page (`/payment/…`: it read once whether
 *   the payment's order is this account's, `useOrderOwnership`, and offers that account's order
 *   page and door); any other page reads the visitor's data again in place
 *   (`resetViewerQueries`: the header's name, hearts, the cart, the «شما» marks);
 * - no session here, but the cookie (a login elsewhere): the tab takes it (the guest's reads
 *   reset, the guest's checkout receiver forgotten) and asks the server once;
 * - with `accountPage`, the account area's own case: no session and no cookie (a logout or a
 *   session end here, then Back), login replaces the page, with it as `next`.
 */
export function SessionSweepAction({ accountPage = false }: { accountPage?: boolean }): null {
  const { hasSession, setHasSession, sessionReplaced } = useSession()
  const expire = useSessionExpired()
  const client = useQueryClient()
  const router = useRouter()
  const act = useEffectEvent(() => {
    const cookie = flagCookieValue()
    if (hasSession) {
      if (cookie === null) return expire({ toLogin: accountPage })
      if (!sessionReplaced()) return
      abandonPushWork()
      const { pathname } = window.location
      if (reloadsOnSwitch(pathname)) {
        void clearViewerQueries(client)
        return reloadPage()
      }
      void resetViewerQueries(client)
      return setHasSession(true)
    }
    if (cookie !== null) {
      void clearViewerQueries(client)
      clearReceiverDraft()
      setHasSession(true)
      return router.refresh()
    }
    if (accountPage) {
      const { pathname, search } = window.location
      router.replace(loginHref(`${pathname}${search}`))
    }
  })
  useEffect(() => act(), [])
  return null
}
