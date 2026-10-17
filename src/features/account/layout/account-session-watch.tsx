'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef } from 'react'
import { abandonPushWork } from '@/features/push/push-storage'
import { loginHref } from '@/lib/links/login'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import { flagCookieValue } from '@/lib/session/flag-cookie'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { clearViewerQueries } from '@/lib/session/viewer-queries'

/** No check has run yet (the first one, on mount, always runs). */
const UNCHECKED = Symbol('unchecked')

/**
 * An account page that is back on screen after its session ended, set right. Neither the proxy
 * nor the account layout sees it: Back (or Forward) shows the page Next cached, and a tab left
 * open does not ask the server again. Every session query is off once the tab has no session,
 * so the page would keep its skeletons forever, or keep showing the visitor's addresses and
 * contact details after a logout in another tab.
 *
 * Checked when the page mounts (also when Back restores it), when the tab is shown again or
 * gets the focus, and when the browser shows the page from its own cache (`pageshow` with
 * `persisted`), against the session flag cookie (the truth, whatever the page last rendered),
 * whose value is the marker of the login the session began with:
 *
 * - no session in this tab, no cookie (a logout or a session end here, then Back): login
 *   replaces the page, with it as `next`;
 * - no session in this tab, but the cookie (a login in another tab): the tab takes the session
 *   itself (the server's flag may never change: a tab first loaded signed in), the guest's
 *   cart and catalog reads go, the session's reads start as the page renders signed in; and the
 *   server renders the page once more, once for that change;
 * - a session in this tab, no cookie (it ended in another tab): it ends here as when a read
 *   answers 401 (`useSessionExpired`: the visitor's data dropped, login replaces the page);
 * - a session in this tab, and the cookie holds another login's marker (a logout and a login in
 *   another tab before this one was back): what is on screen is the previous visitor's. It goes
 *   (`clearViewerQueries`), this tab's web push steps stop (the stored registration is left to
 *   the login that replaced it, and the next page's owner check), and the page loads again.
 *
 * Coming back to a tab fires both `visibilitychange` and `focus`: a check that finds the cookie
 * as the last one did has nothing to do (an access-token refresh keeps the marker). The session
 * flag turning off while the page is on screen is no reason to check: a logout from here goes
 * home by itself, and a read that meets the end of the session goes to login.
 */
export function AccountSessionWatch(): null {
  const { hasSession, setHasSession, sessionReplaced } = useSession()
  const expire = useSessionExpired()
  const router = useRouter()
  const client = useQueryClient()
  const checked = useRef<string | null | typeof UNCHECKED>(UNCHECKED)
  const check = useEffectEvent(() => {
    const cookie = flagCookieValue()
    if (cookie === checked.current) return
    checked.current = cookie
    if (hasSession) {
      if (cookie === null) return expire({ toLogin: true })
      if (sessionReplaced()) {
        abandonPushWork()
        void clearViewerQueries(client)
        reloadPage()
      }
      return
    }
    if (cookie !== null) {
      void clearViewerQueries(client)
      setHasSession(true)
      return router.refresh()
    }
    const { pathname, search } = window.location
    router.replace(loginHref(`${pathname}${search}`))
  })

  useEffect(() => {
    check()
    const onFocus = () => check()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return null
}
