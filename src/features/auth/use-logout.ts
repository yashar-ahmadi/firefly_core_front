'use client'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { announce } from '@/components/ui/live-announcer'
import { notify, toastRegionReady } from '@/components/ui/toaster'
import { clearReceiverDraft } from '@/features/checkout/receiver-draft'
import {
  abandonPushWork,
  clearPushState,
  readPushState,
  settlePushWork,
} from '@/features/push/push-storage'
import { ApiError } from '@/lib/api/errors'
import { sweepAfterNavigation } from '@/lib/session/after-logout'
import { flagCookieSet } from '@/lib/session/flag-cookie'
import { useSession } from '@/lib/session/session-context'
import { clearViewerQueries } from '@/lib/session/viewer-queries'
import { authApi } from './api'
import { LOGOUT_STEP_TIMEOUT_MS, runBeforeLogout } from './logout-hooks'
import { forgetSignedInStorage } from './logout-storage'

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
export const LOGOUT_OFFLINE = 'خروج انجام نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید'

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
 * Whether the logout request failed before the BFF could drop the session cookies: no answer at
 * all (`status` 0), and the session flag cookie (alive as long as the httpOnly ones) still set.
 * An answer lost after the BFF had replied (the cookies gone) is a logout all the same.
 */
function sessionSurvived(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0 && flagCookieSet()
}

/** Says something the visitor must hear, in a toast (and the live region before the toaster). */
function tell(kind: 'success' | 'error', message: string): void {
  notify[kind](message)
  if (!toastRegionReady()) announce(message)
}

/**
 * Forgets the visitor in this tab, in this order:
 *
 * 1. The session flag turns off at once (`flushSync`): every session-gated query on screen is
 *    disabled before anything else, so none of them asks again and meets a 401, and each counts
 *    as unobserved for the sweep below.
 * 2. `clearViewerQueries`: the registered session queries go (and a checkout receiver kept in the
 *    tab, `clearReceiverDraft`; the pending payments saved while signed in, the tab's last placed
 *    order and placement key, `forgetSignedInStorage`), the cart and product payloads on
 *    screen read again as a guest's (hearts, the cart badge, the comment «شما» marks).
 * 3. Every query no enabled observer reads goes. Queries still read on screen stay attached
 *    (removing an observed query would detach its component from the cache).
 * 4. Once the navigation home has committed, the same sweep again (`AfterLogoutSweep`): the
 *    queries of the page that was left, whatever their key.
 */
function forgetVisitor(client: QueryClient, setHasSession: (value: boolean) => void) {
  flushSync(() => setHasSession(false))
  const cleared = clearViewerQueries(client)
  clearReceiverDraft()
  forgetSignedInStorage()
  client.removeQueries({ type: 'inactive' })
  if (window.location.pathname !== '/') sweepAfterNavigation()
  return cleared
}

/**
 * Logout (auth digest §4.10–4.11, F6):
 *
 * 1. The steps registered with `onBeforeLogout`, while the session still exists; one that fails
 *    or hangs never holds the logout back.
 * 2. Web push steps on their way stop, and are waited for (3 s at most).
 *    `POST logout/` (the BFF adds this device's refresh token) with this browser's push token when
 *    web push is on (`registration_id`: the API deactivates the device, digest §4.3), or
 *    `logout-all/` (which deactivates every device itself). The BFF clears the session cookies
 *    whatever the API answers, even when it cannot be reached.
 * 3. Whatever the API answered (F6: never blocked by the server), the browser forgets its push
 *    registration, the tab forgets the visitor (`forgetVisitor`), goes home
 *    (`router.replace('/')`) and says so in a toast.
 *
 * Except when the request never reached the BFF (no connection: `sessionSurvived`): the cookies
 * are still there, so the next page load would be signed in again. Then nothing changes here
 * (the session, its data and web push stay), a toast says the logout did not happen, and
 * «خروج» can be pressed again.
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
        // A push step on its way (a re-register, a token check) must not land after the logout.
        abandonPushWork()
        await settlePushWork(LOGOUT_STEP_TIMEOUT_MS)
        const push = readPushState()
        try {
          if (all) await authApi.logoutAll()
          else await (push ? authApi.logout({ registration_id: push.token }) : authApi.logout())
        } catch (error) {
          if (sessionSurvived(error)) return tell('error', LOGOUT_OFFLINE)
          // Signed out on this device anyway (F6): the BFF has dropped the session cookies.
        }
        clearPushState()
        const cleared = forgetVisitor(client, setHasSession)
        router.replace('/')
        tell('success', LOGGED_OUT)
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
