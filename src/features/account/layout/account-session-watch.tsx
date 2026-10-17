'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent } from 'react'
import { loginHref } from '@/lib/links/login'
import { flagCookieSet } from '@/lib/session/flag-cookie'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'

/**
 * An account page that is back on screen after its session ended, set right. Neither the proxy
 * nor the account layout sees it: Back (or Forward) shows the page Next cached, and a tab left
 * open does not ask the server again. Every session query is off once the tab has no session,
 * so the page would keep its skeletons forever, or keep showing the visitor's addresses and
 * contact details after a logout in another tab.
 *
 * Checked when the page mounts (also when Back restores it), when the tab is shown again or
 * gets the focus, and when the browser shows the page from its own cache (`pageshow` with
 * `persisted`), against the session flag cookie (the truth, whatever the page last rendered):
 *
 * - no session in this tab, no cookie (a logout or a session end here, then Back): login
 *   replaces the page, with it as `next`;
 * - no session in this tab, but the cookie (a login in another tab): the server renders the page
 *   again, and its session flag with it (`SessionProvider` takes the server's value);
 * - a session in this tab, no cookie (it ended in another tab): it ends here as when a read
 *   answers 401 (`useSessionExpired`: the visitor's data dropped, login replaces the page).
 *
 * The session flag turning off while the page is on screen is no reason to check: a logout from
 * here goes home by itself, and a read that meets the end of the session goes to login.
 */
export function AccountSessionWatch(): null {
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  const router = useRouter()
  const check = useEffectEvent(() => {
    const cookie = flagCookieSet()
    if (hasSession) {
      if (!cookie) expire({ toLogin: true })
      return
    }
    if (cookie) return router.refresh()
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
