'use client'

import { useEffect, useEffectEvent } from 'react'
import { COOKIE } from '@/lib/auth/cookies'
import { useSession } from './session-context'
import { useSessionExpired } from './use-session-expired'

const FLAG_COOKIE = new RegExp(`(?:^|;\\s*)${COOKIE.flag}=`)

/** Whether the session flag cookie (`ff_auth`: script-readable, alive as long as `ff_rt`) is set. */
function flagCookieSet(): boolean {
  return FLAG_COOKIE.test(document.cookie)
}

/**
 * Ends a session this tab still believes in after it is gone, on the pages a server redirect
 * leads to (the auth pages). The account guard sends a visitor whose session is gone to login,
 * also during a client navigation (the session ended in another tab, then a link here): the root
 * layout is not rendered again then, so the tab still thinks it is signed in, and login would show
 * «شما وارد شده‌اید» with the cached profile.
 *
 * The truth is the flag cookie as it is now, read when the layout mounts or the server renders it
 * again (`hasSession`, the request's view, only triggers the check). The prop alone would not do:
 * a back/forward visit replays an old render of the layout, e.g. a guest's login page after the
 * visitor has logged in, which would end a live session. When the cookie is gone and the tab
 * still has a session, it ends as when a read answers 401 (`useSessionExpired`: the flag off, the
 * visitor's data dropped; no navigation from here). A login on the page afterwards stays.
 */
export function SessionCheck({ hasSession: onServer }: { hasSession: boolean }) {
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  const check = useEffectEvent(() => {
    if (hasSession && !flagCookieSet()) expire()
  })
  useEffect(() => check(), [onServer])
  return null
}
