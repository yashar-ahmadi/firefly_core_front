'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react'
import { notify } from '@/components/ui/toaster'
import { fetchProfile } from '@/features/auth/profile-api'
import { useMe } from '@/features/auth/use-me'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError, ME_KEY } from '@/lib/session/viewer-queries'
import { unregisterDevice } from './devices-api'
import type { Messaging } from './firebase'
import { browserSupportsPush, refreshToken, subscribe } from './push-flow'
import {
  abandonPushWork,
  clearPushState,
  ownedPushState,
  pushMark,
  readPushState,
  settlePushWork,
  trackPushWork,
} from './push-storage'

/**
 * - `unavailable`: the shop has no web push (no Firebase config): nothing is shown or loaded.
 * - `unsupported`: this browser cannot receive it (iOS Safari before the site is installed).
 * - `denied`: the visitor blocked notifications for the site in the browser's settings.
 * - `on`: permission granted and a registration stored for the signed-in account.
 */
export type PushStatus =
  'unavailable' | 'unsupported' | 'denied' | 'off' | 'enabling' | 'on' | 'disabling'

export interface WebPush {
  /** Push can be offered here (the shop has it and the browser can receive it). */
  supported: boolean
  status: PushStatus
  /** Why the last switch failed, or null. */
  error: string | null
  /** Call it from the visitor's gesture: the browser's permission prompt comes first. */
  enable: () => void
  disable: () => void
}

export const ENABLE_FAILED = 'روشن کردن اعلان‌ها انجام نشد. لطفاً دوباره تلاش کنید.'
export const DISABLE_FAILED = 'خاموش کردن اعلان‌ها انجام نشد. لطفاً دوباره تلاش کنید.'

/**
 * Web push for the inbox's switch (dashboard digest §4.3–4.4). Client only: it reads the
 * browser's permission and the stored registration as it renders. On: permission (asked only now,
 * from the visitor's gesture), `/sw.js`, the Firebase token, `POST devices/`, stored for the
 * signed-in account. Off: the steps on their way stop and are waited for, then `DELETE
 * devices/unregister/`, and the token is revoked and forgotten. While it is on, opening the
 * inbox checks the token (registering a rotated one) and a push received in view shows a toast
 * (the inbox reads itself again on the worker's word: `useInboxRefresh`). Another account's
 * registration is forgotten, never shown as on; a permission withdrawn in the browser's settings
 * unregisters the device.
 */
export function useWebPush(): WebPush {
  const config = useOptionalStoreConfig()
  const client = useQueryClient()
  const expire = useSessionExpired()
  const owner = useMe().data?.uuid
  const [phase, setPhase] = useState<'idle' | 'enabling' | 'disabling'>('idle')
  const [error, setError] = useState<string | null>(null)
  // Read the stored registration again (after this hook wrote or forgot it).
  const [, reread] = useReducer((count: number) => count + 1, 0)
  const messaging = useRef<Messaging | null>(null)
  const stopListening = useRef(() => {})
  const firebase = config?.features.webPush ? (config.firebase ?? null) : null

  let status: PushStatus
  if (!firebase) status = 'unavailable'
  else if (!browserSupportsPush()) status = 'unsupported'
  else if (phase !== 'idle') status = phase
  else if (Notification.permission === 'denied') status = 'denied'
  else {
    const mine = owner !== undefined && readPushState()?.owner === owner
    status = Notification.permission === 'granted' && mine ? 'on' : 'off'
  }

  const listen = (loaded: Messaging) => {
    messaging.current = loaded
    stopListening.current()
    stopListening.current = loaded.onMessage(({ title, body }) => {
      notify.info(title || 'اعلان تازه', body ? { description: body } : undefined)
    })
  }
  const listenOnce = useEffectEvent(listen)

  useEffect(() => {
    if (!firebase || !owner || !browserSupportsPush()) return
    const stored = ownedPushState(owner)
    if (!stored) return
    if (Notification.permission !== 'granted') {
      // Withdrawn in the browser's settings: this device cannot be reached any more.
      void trackPushWork(unregisterDevice(stored.token)).catch(() => undefined)
      clearPushState()
      return
    }
    let gone = false
    // A failed check leaves push on: the stored token keeps working until shown otherwise.
    refreshToken(firebase, stored, pushMark()).then(
      (loaded) => {
        if (!gone) listenOnce(loaded)
      },
      () => undefined,
    )
    return () => {
      gone = true
      stopListening.current()
    }
  }, [firebase, owner])

  const busy = phase !== 'idle'

  const enable = () => {
    if (!firebase || busy) return
    setPhase('enabling')
    setError(null)
    void (async () => {
      // First thing in the gesture's handler: some browsers allow the prompt only then.
      const permission = await Notification.requestPermission().catch(() => 'default' as const)
      if (permission === 'granted') {
        try {
          const account =
            owner ??
            (await client.ensureQueryData({ queryKey: ME_KEY, queryFn: () => fetchProfile() }))
              ?.uuid
          if (!account) throw new Error('no profile')
          listen(await subscribe(firebase, account))
        } catch (failure) {
          if (isSessionExpiredError(failure)) return expire({ toLogin: true })
          setError(ENABLE_FAILED)
        }
      }
      setPhase('idle')
      reread()
    })()
  }

  const disable = () => {
    if (busy) return
    setPhase('disabling')
    setError(null)
    void (async () => {
      // A token check or a re-register on its way must not undo this: stopped, then waited for.
      abandonPushWork()
      await settlePushWork()
      const stored = readPushState()
      try {
        if (stored) await unregisterDevice(stored.token)
      } catch (failure) {
        if (isSessionExpiredError(failure)) return expire({ toLogin: true })
        setError(DISABLE_FAILED)
        return setPhase('idle')
      }
      stopListening.current()
      stopListening.current = () => {}
      await messaging.current?.deleteToken().catch(() => undefined)
      messaging.current = null
      clearPushState()
      setPhase('idle')
      reread()
    })()
  }

  const supported = status !== 'unavailable' && status !== 'unsupported'
  return { supported, status, error, enable, disable }
}
