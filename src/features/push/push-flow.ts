import type { FirebaseWebConfig } from '@/config/env-schema'
import { deviceName } from './device-name'
import { registerDevice, unregisterDevice } from './devices-api'
import { loadMessaging, type Messaging } from './firebase'
import { savePushState, stillCurrent, trackPushWork, type PushState } from './push-storage'

// Web push's steps that need the service worker and Firebase (dashboard digest §4.3–4.4). No
// React: the inbox's toggle runs them, and the re-register effect loads this module (and so
// Firebase) at most once a day for the token check.

/** A step stopped because the registration it read was forgotten or abandoned meanwhile. */
export class PushAbandoned extends Error {
  constructor() {
    super('push registration changed meanwhile')
    this.name = 'PushAbandoned'
  }
}

/** The site's single service worker (src/app/sw.js/route.ts), for the whole site. */
export const SW_PATH = '/sw.js'
const SW_READY_MS = 15_000

/** The browser has what web push needs (iOS Safari only once the site is installed). */
export function browserSupportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('service worker not ready')), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

/** Registers `/sw.js` (scope `/`) and resolves once it is active. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SW_PATH, { scope: '/' })
  return withTimeout(navigator.serviceWorker.ready, SW_READY_MS)
}

/** The active registration push was turned on with, or a new one. */
async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  return existing?.active ? existing : registerServiceWorker()
}

/**
 * Turning push on for `owner` (the account's uuid), once permission is granted, in this order:
 * the service worker, Firebase, the token (through that worker's push manager), then `POST
 * devices/` with this browser's label. Stores the token with its owner. Rejects at the first step
 * that fails.
 */
export async function subscribe(config: FirebaseWebConfig, owner: string): Promise<Messaging> {
  const registration = await registerServiceWorker()
  const messaging = await loadMessaging(config)
  const token = await messaging.getToken(registration)
  await registerDevice(token, deviceName(navigator.userAgent))
  savePushState({ token, owner, checkedAt: Date.now() })
  return messaging
}

async function check(config: FirebaseWebConfig, stored: PushState, mark: number) {
  const current = () => {
    if (!stillCurrent(stored, mark)) throw new PushAbandoned()
  }
  const messaging = await loadMessaging(config)
  current()
  const token = await messaging.getToken(await serviceWorker())
  current()
  if (token !== stored.token) {
    await registerDevice(token, deviceName(navigator.userAgent))
    await unregisterDevice(stored.token).catch(() => undefined)
    if (!stillCurrent(stored, mark)) {
      // Posted for a registration that is gone: unregistered again.
      await unregisterDevice(token).catch(() => undefined)
      throw new PushAbandoned()
    }
  }
  // Nothing awaited since the last check: nothing can have changed in between.
  savePushState({ ...stored, token, checkedAt: Date.now() })
  return messaging
}

/**
 * The token check (an FCM token can rotate): a new token is registered and the old one
 * unregistered, then stored; the same one only records the check. `mark` (`pushMark`) is taken
 * with `stored`: once that registration is forgotten or abandoned (push off, a logout), the check
 * writes nothing more and rejects with `PushAbandoned` (a token it posted is unregistered again).
 * Tracked, so a disable waits for it. Returns the messaging.
 */
export function refreshToken(
  config: FirebaseWebConfig,
  stored: PushState,
  mark: number,
): Promise<Messaging> {
  return trackPushWork(check(config, stored, mark))
}
