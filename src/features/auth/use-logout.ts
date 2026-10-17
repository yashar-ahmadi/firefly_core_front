'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { notify, toastRegionReady } from '@/components/ui/toaster'
import { useSession } from '@/lib/session/session-context'
import { clearViewerQueries } from '@/lib/session/viewer-queries'
import { authApi } from './api'
import { runBeforeLogout } from './logout-hooks'

export interface LogoutOptions {
  /** Every device (`logout-all/`), not only this one. */
  all?: boolean
}

export interface Logout {
  /** Never rejects; a second call while one runs gets the same promise. */
  logout: (options?: LogoutOptions) => Promise<void>
  /** A logout is on its way. */
  pending: boolean
}

export const LOGGED_OUT = 'از حساب خارج شدید'

/**
 * Logout (auth digest §4.10–4.11, F6):
 *
 * 1. The steps registered with `onBeforeLogout` (web push unregisters this device), while the
 *    session still exists; one that fails or hangs never holds the logout back.
 * 2. `POST logout/` (the BFF adds this device's refresh token) or `logout-all/`. The BFF clears
 *    the session cookies whatever the API answers, even when it cannot be reached.
 * 3. Whatever the answer (F6: never blocked by the server), this tab forgets the visitor: the
 *    session flag turns off first (every session-only query is disabled, so nothing asks again
 *    and meets a 401), then `clearViewerQueries` (hearts, the cart badge and the comment «شما»
 *    marks read again as a guest's) and every other query nothing on screen reads; then
 *    `router.replace('/')` and a toast.
 */
export function useLogout(): Logout {
  const client = useQueryClient()
  const router = useRouter()
  const { setHasSession } = useSession()
  const running = useRef<Promise<void> | null>(null)
  const [pending, setPending] = useState(false)

  const logout = useCallback(
    (options: LogoutOptions = {}) => {
      if (running.current) return running.current
      const all = options.all ?? false
      const run = async () => {
        await runBeforeLogout({ all })
        try {
          await (all ? authApi.logoutAll() : authApi.logout())
        } catch {
          // Signed out on this device anyway (F6): the BFF has dropped the session cookies.
        }
        setHasSession(false)
        const cleared = clearViewerQueries(client)
        // The rest of the cache: what no component on screen reads. What is on screen stays
        // attached (it is the same for everyone), and the next page reads its own.
        client.removeQueries({ type: 'inactive' })
        router.replace('/')
        notify.success(LOGGED_OUT)
        if (!toastRegionReady()) announce(LOGGED_OUT)
        await cleared
      }
      setPending(true)
      running.current = run().finally(() => {
        running.current = null
        setPending(false)
      })
      return running.current
    },
    [client, router, setHasSession],
  )

  return { logout, pending }
}
