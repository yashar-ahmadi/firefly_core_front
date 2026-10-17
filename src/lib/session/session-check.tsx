'use client'

import { useEffect, useEffectEvent } from 'react'
import { useSession } from './session-context'
import { useSessionExpired } from './use-session-expired'

/**
 * The server's word on the session, for the pages a server redirect leads to (the auth pages).
 * The account guard sends a visitor whose session is gone to login, also during a client
 * navigation (the session ended in another tab, then a link here): the root layout is not
 * rendered again then, so the tab still thinks it is signed in, and login would show «شما وارد
 * شده‌اید» with the cached profile. When this render's request carried no session, the tab's
 * session ends as when a read answers 401 (`useSessionExpired`: the flag off, the visitor's data
 * dropped; no navigation from here). Only the server's value is acted on: a login on the page
 * turns the flag on afterwards, and that stays.
 */
export function SessionCheck({ hasSession: onServer }: { hasSession: boolean }) {
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  const check = useEffectEvent(() => {
    if (!onServer && hasSession) expire()
  })
  useEffect(() => check(), [onServer])
  return null
}
