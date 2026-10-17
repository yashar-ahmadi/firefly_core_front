'use client'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { announce } from '@/components/ui/live-announcer'
import { notify, toastRegionReady } from '@/components/ui/toaster'
import { sweepAfterNavigation } from '@/lib/session/after-logout'
import { useSession } from '@/lib/session/session-context'
import { clearViewerQueries } from '@/lib/session/viewer-queries'
import { authApi } from './api'
import { runBeforeLogout } from './logout-hooks'

export interface LogoutOptions {
  /** Every device (`logout-all/`), not only this one. */
  all?: boolean
}

export interface Logout {
  /** Never rejects; a call while a logout runs (from any place) gets that logout's promise. */
  logout: (options?: LogoutOptions) => Promise<void>
  /** A logout is on its way, from whichever place started it. */
  pending: boolean
}

export const LOGGED_OUT = 'از حساب خارج شدید'

// The logout in flight, for the whole tab: the header menu and a page's «خروج» share it.
let running: Promise<void> | null = null
const listeners = new Set<() => void>()

function setRunning(next: Promise<void> | null): void {
  running = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const isRunning = () => running !== null
const notRunning = () => false

/**
 * Forgets the visitor in this tab, in this order:
 *
 * 1. The session flag turns off at once (`flushSync`): every session-gated query on screen is
 *    disabled before anything else, so none of them asks again and meets a 401, and each counts
 *    as unobserved for the sweep below.
 * 2. `clearViewerQueries`: the registered session queries go, the cart and product payloads on
 *    screen read again as a guest's (hearts, the cart badge, the comment «شما» marks).
 * 3. Every query no enabled observer reads goes. Queries still read on screen stay attached
 *    (removing an observed query would detach its component from the cache).
 * 4. Once the navigation home has committed, the same sweep again (`AfterLogoutSweep`): the
 *    queries of the page that was left, whatever their key.
 */
function forgetVisitor(client: QueryClient, setHasSession: (value: boolean) => void) {
  flushSync(() => setHasSession(false))
  const cleared = clearViewerQueries(client)
  client.removeQueries({ type: 'inactive' })
  if (window.location.pathname !== '/') sweepAfterNavigation()
  return cleared
}

/**
 * Logout (auth digest §4.10–4.11, F6):
 *
 * 1. The steps registered with `onBeforeLogout` (web push unregisters this device), while the
 *    session still exists; one that fails or hangs never holds the logout back.
 * 2. `POST logout/` (the BFF adds this device's refresh token) or `logout-all/`. The BFF clears
 *    the session cookies whatever the API answers, even when it cannot be reached.
 * 3. Whatever the answer (F6: never blocked by the server), the tab forgets the visitor
 *    (`forgetVisitor`), goes home (`router.replace('/')`) and says so in a toast.
 */
export function useLogout(): Logout {
  const client = useQueryClient()
  const router = useRouter()
  const { setHasSession } = useSession()
  const pending = useSyncExternalStore(subscribe, isRunning, notRunning)

  const logout = useCallback(
    (options: LogoutOptions = {}) => {
      if (running) return running
      const all = options.all ?? false
      const run = async () => {
        await runBeforeLogout({ all })
        try {
          await (all ? authApi.logoutAll() : authApi.logout())
        } catch {
          // Signed out on this device anyway (F6): the BFF has dropped the session cookies.
        }
        const cleared = forgetVisitor(client, setHasSession)
        router.replace('/')
        notify.success(LOGGED_OUT)
        if (!toastRegionReady()) announce(LOGGED_OUT)
        await cleared
      }
      const promise = run().finally(() => setRunning(null))
      setRunning(promise)
      return promise
    },
    [client, router, setHasSession],
  )

  return { logout, pending }
}
