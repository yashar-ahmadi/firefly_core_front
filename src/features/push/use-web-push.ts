'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { notify } from '@/components/ui/toaster'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { refreshInbox } from '@/features/notifications/notifications-cache'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { unregisterDevice } from './devices-api'
import type { Messaging } from './firebase'
import { browserSupportsPush, refreshToken, subscribe } from './push-flow'
import { clearPushState, readPushState } from './push-storage'

/**
 * - `unavailable`: the shop has no web push (no Firebase config): nothing is shown or loaded.
 * - `unsupported`: this browser cannot receive it (iOS Safari before the site is installed).
 * - `denied`: the visitor blocked notifications for the site in the browser's settings.
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

function initialStatus(config: PublicStoreConfig | null): PushStatus {
  if (!config?.features.webPush || !config.firebase) return 'unavailable'
  if (!browserSupportsPush()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && readPushState() ? 'on' : 'off'
}

/**
 * Web push for the inbox's switch (dashboard digest §4.3–4.4). Client only (it reads the
 * browser's permission on its first render). On: permission (asked only now, from the visitor's
 * gesture), `/sw.js`, the Firebase token, `POST devices/`. Off: `DELETE devices/unregister/`,
 * then the token is revoked and forgotten. While it is on, opening the inbox checks the token
 * (registering a rotated one) and pushes received in view show a toast and read the inbox again;
 * a permission withdrawn in the browser's settings unregisters the device.
 */
export function useWebPush(): WebPush {
  const config = useOptionalStoreConfig()
  const client = useQueryClient()
  const expire = useSessionExpired()
  const [status, setStatus] = useState<PushStatus>(() => initialStatus(config))
  const [error, setError] = useState<string | null>(null)
  const messaging = useRef<Messaging | null>(null)
  const stopListening = useRef(() => {})
  const firebase = status === 'unavailable' ? null : (config?.firebase ?? null)

  const listen = (loaded: Messaging) => {
    messaging.current = loaded
    stopListening.current()
    stopListening.current = loaded.onMessage(({ title, body }) => {
      notify.info(title || 'اعلان تازه', body ? { description: body } : undefined)
      void refreshInbox(client)
    })
  }

  const listenOnce = useEffectEvent(listen)

  useEffect(() => {
    const stored = firebase && browserSupportsPush() ? readPushState() : null
    if (!firebase || !stored) return
    if (Notification.permission !== 'granted') {
      // Withdrawn in the browser's settings: this device cannot be reached any more.
      void unregisterDevice(stored.token).catch(() => undefined)
      clearPushState()
      return
    }
    let gone = false
    // A failed check leaves push on: the stored token keeps working until shown otherwise.
    refreshToken(firebase, stored).then(
      (loaded) => {
        if (!gone) listenOnce(loaded)
      },
      () => undefined,
    )
    return () => {
      gone = true
      stopListening.current()
    }
  }, [firebase])

  const busy = status === 'enabling' || status === 'disabling'

  const enable = () => {
    if (!firebase || busy) return
    setStatus('enabling')
    setError(null)
    void (async () => {
      // First thing in the gesture's handler: some browsers allow the prompt only then.
      const permission = await Notification.requestPermission().catch(() => 'default' as const)
      if (permission !== 'granted') return setStatus(permission === 'denied' ? 'denied' : 'off')
      try {
        listen(await subscribe(firebase))
        setStatus('on')
      } catch (failure) {
        if (isSessionExpiredError(failure)) return expire({ toLogin: true })
        setStatus('off')
        setError(ENABLE_FAILED)
      }
    })()
  }

  const disable = () => {
    if (busy) return
    const stored = readPushState()
    setStatus('disabling')
    setError(null)
    void (async () => {
      try {
        if (stored) await unregisterDevice(stored.token)
      } catch (failure) {
        if (isSessionExpiredError(failure)) return expire({ toLogin: true })
        setStatus('on')
        setError(DISABLE_FAILED)
        return
      }
      stopListening.current()
      await messaging.current?.deleteToken().catch(() => undefined)
      clearPushState()
      setStatus('off')
    })()
  }

  const supported = status !== 'unavailable' && status !== 'unsupported'
  return { supported, status, error, enable, disable }
}
