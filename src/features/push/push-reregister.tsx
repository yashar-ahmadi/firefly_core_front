'use client'

import { useEffect } from 'react'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { useSession } from '@/lib/session/session-context'
import { registerDevice, unregisterDevice } from './devices-api'
import { clearPushState, readPushState } from './push-storage'

/** How often Firebase is asked whether the token rotated, away from the inbox. */
export const TOKEN_CHECK_MS = 24 * 60 * 60_000

/**
 * Keeps this browser's push device alive (dashboard digest §4.3, step 2: a failed send can
 * deactivate devices), on every page load while push is on and the visitor is signed in: once the
 * browser is idle, the stored token is posted again (`POST devices/`, without Firebase). Once a
 * day it loads the token check instead (Firebase, in its own chunk), which posts a rotated token.
 * A permission withdrawn in the browser's settings unregisters the device. Renders nothing; the
 * shop layout mounts it (`LazyPushReregister`) only when the shop has web push.
 */
export function PushReregister() {
  const firebase = useOptionalStoreConfig()?.firebase ?? null
  const { hasSession } = useSession()
  useEffect(() => {
    const stored = firebase && hasSession ? readPushState() : null
    if (!firebase || !stored) return
    const run = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        void unregisterDevice(stored.token).catch(() => undefined)
        return clearPushState()
      }
      if (Date.now() - stored.checkedAt < TOKEN_CHECK_MS) {
        return void registerDevice(stored.token).catch(() => undefined)
      }
      import('./push-flow')
        .then((flow) => flow.refreshToken(firebase, stored))
        .catch(() => registerDevice(stored.token))
        .catch(() => undefined)
    }
    if (!('requestIdleCallback' in window)) {
      const timer = setTimeout(run, 2000)
      return () => clearTimeout(timer)
    }
    const idle = requestIdleCallback(run, { timeout: 10_000 })
    return () => cancelIdleCallback(idle)
  }, [firebase, hasSession])
  return null
}
