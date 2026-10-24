'use client'

import { useEffect, useEffectEvent } from 'react'
import { flagCookieSet } from './flag-cookie'
import { useSession } from './session-context'

/**
 * The session state of a page the service worker kept (Plan 5 final fix wave). Its anonymous copy
 * of the home page, rendered for no one (`hasSession: false`), is what a navigation of `/` gets
 * after 4 s without an answer, or offline (src/features/pwa/sw-offline-fetch.ts): a signed-in
 * visitor would keep the guest's header on every shop page until a full load. No server render
 * mounts like that: the root layout's `hasSession` is the session flag cookie itself. So a page
 * that mounts with no session while the cookie is set takes the cookie's session, in place. The
 * page's own reads went out with the visitor's cookies, so nothing else differs, and nothing is
 * asked of a network that may be gone (a router refresh that fails offline turns into a full load
 * of the same copy): no reload, no loop. A session without the cookie is left to the session's
 * end, as on any page. Mounted by each kept shop page, the home page alone (with the PWA on);
 * renders nothing.
 */
export function KeptCopySession(): null {
  const { hasSession, setHasSession } = useSession()
  const heal = useEffectEvent(() => {
    if (!hasSession && flagCookieSet()) setHasSession(true)
  })
  useEffect(() => heal(), [])
  return null
}
