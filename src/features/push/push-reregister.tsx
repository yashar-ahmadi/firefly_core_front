'use client'

import { useEffect } from 'react'
import type { FirebaseWebConfig } from '@/config/env-schema'
import { useMe } from '@/features/auth/use-me'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { useSession } from '@/lib/session/session-context'
import { registerDevice, unregisterDevice } from './devices-api'
import {
  clearPushState,
  ownedPushState,
  pushMark,
  readPushState,
  savePushState,
  stillCurrent,
  trackPushWork,
} from './push-storage'

/** How often Firebase is asked whether the token rotated, away from the inbox (and back-off). */
export const TOKEN_CHECK_MS = 24 * 60 * 60_000

/**
 * Keeps this browser's push device alive (dashboard digest §4.3, step 2: a failed send can
 * deactivate devices), on every page load while push is on and its account is signed in: once
 * the browser is idle, the stored token is posted again (`POST devices/`, without Firebase).
 * Once a day it loads the token check instead (Firebase, in its own chunk), which posts a rotated
 * token; a check that fails is tried again a day later, the stored token posted meanwhile.
 *
 * Never for anyone else: a registration of another account (a session that ended unseen, then
 * someone else signed in) or one left while signed out is forgotten here, with the browser's
 * subscription. A permission withdrawn in the browser's settings unregisters the device. Nothing
 * is written once the registration was forgotten or push turned off meanwhile (`stillCurrent`).
 * The profile (whose registration it is) is read only when a registration is stored. Renders
 * nothing; the shop layout mounts it (`LazyPushReregister`) only when the shop has push.
 */
export function PushReregister() {
  const firebase = useOptionalStoreConfig()?.firebase ?? null
  const { hasSession } = useSession()
  // Loaded without SSR: the stored registration can be read as it renders.
  const stored = firebase !== null && readPushState() !== null
  useEffect(() => {
    // Signed out with a registration left behind (a session that ended unseen): forgotten here.
    if (firebase && !hasSession && readPushState()) clearPushState()
  }, [firebase, hasSession])
  // Whose registration it is needs the profile: read only when there is one.
  return firebase && hasSession && stored ? <OwnedReregister firebase={firebase} /> : null
}

function OwnedReregister({ firebase }: { firebase: FirebaseWebConfig }) {
  const owner = useMe().data?.uuid
  useEffect(() => {
    // The profile is on its way: whose registration it is waits for it.
    const stored = owner ? ownedPushState(owner) : null
    if (!stored) return
    const mark = pushMark()
    const run = () => {
      if (!stillCurrent(stored, mark)) return
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        void trackPushWork(unregisterDevice(stored.token)).catch(() => undefined)
        return clearPushState()
      }
      if (Date.now() - stored.checkedAt < TOKEN_CHECK_MS) {
        return void trackPushWork(registerDevice(stored.token)).catch(() => undefined)
      }
      const checked = import('./push-flow')
        .then((flow) => flow.refreshToken(firebase, stored, mark))
        .then(
          () => undefined,
          async () => {
            // Abandoned (push off, a logout): nothing more. Else tried again in a day.
            if (!stillCurrent(stored, mark)) return
            savePushState({ ...stored, checkedAt: Date.now() })
            await registerDevice(stored.token)
          },
        )
      void trackPushWork(checked).catch(() => undefined)
    }
    if (!('requestIdleCallback' in window)) {
      const timer = setTimeout(run, 2000)
      return () => clearTimeout(timer)
    }
    const idle = requestIdleCallback(run, { timeout: 10_000 })
    return () => cancelIdleCallback(idle)
  }, [firebase, owner])
  return null
}
