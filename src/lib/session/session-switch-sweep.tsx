'use client'

import dynamic from 'next/dynamic'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import { flagCookieValue } from './flag-cookie'
import { useSession } from './session-context'

/**
 * When the action's code cannot load: the server's render is the truth, so the page reloads; never
 * for a page the worker kept (`heal`: offline, it would load the same copy again).
 */
function ReloadInstead({ heal }: { heal?: boolean }): null {
  useEffect(() => {
    if (!heal) reloadPage()
  }, [heal])
  return null
}

// What to do is rare (another tab logged out or in): its code loads only then.
const SessionSweepAction = dynamic(
  () =>
    import('./session-sweep-action')
      .then((module) => module.SessionSweepAction)
      .catch(() => ReloadInstead),
  { ssr: false },
)

/**
 * The shop-wide sweep (mounted once, in the root providers): each time the tab comes back (shown
 * again, focused, or restored from the browser's cache) it reads the session flag cookie, and
 * when this tab's session no longer matches it (a session but no cookie, another login's marker,
 * or no session but a cookie) mounts `SessionSweepAction`, which sets it right. On mount, a page
 * rendered for the cookie it was sent has nothing to set right; one that says no session while the
 * cookie holds one was never rendered for it: the service worker's kept copy of the home page,
 * shown after 4 s or offline. That one is set right at once (`heal`, session-heal.ts). Coming
 * back fires both `visibilitychange` and `focus`: a check that finds the cookie as the last one
 * did does nothing (an access-token refresh keeps the marker too).
 */
export function SessionSwitchSweep() {
  const { hasSession, sessionReplaced } = useSession()
  const [action, setAction] = useState(0)
  const checked = useRef<string | null | undefined>(undefined)
  const check = useEffectEvent(() => {
    const cookie = flagCookieValue()
    if (cookie === checked.current) return
    checked.current = cookie
    const off = hasSession ? cookie === null || sessionReplaced() : cookie !== null
    if (off) setAction((count) => Math.max(count, 0) + 1)
  })
  // -1: the kept copy's heal.
  const mount = useEffectEvent(() => {
    checked.current = flagCookieValue()
    if (!hasSession && checked.current !== null) setAction(-1)
  })

  useEffect(() => {
    mount()
    const run = () => check()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) run()
    }
    window.addEventListener('focus', run)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', run)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  // A new key per finding: the action runs once each time.
  return action ? <SessionSweepAction key={action} heal={action < 0} /> : null
}
