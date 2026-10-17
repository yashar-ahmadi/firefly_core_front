// This browser's web push registration (dashboard digest §4.3): the FCM token sent to `devices/`
// and when it was last checked against Firebase. Its presence is the "push is on" flag. Kept in
// localStorage; without storage push simply reads as off. No React, no Firebase: it is part of
// every shop page (the re-register effect), the session's end and logout.

export interface PushState {
  /** The FCM registration token, as `devices/` received it. */
  token: string
  /** When Firebase last confirmed the token (ms). */
  checkedAt: number
}

const KEY = 'ff_push'

export function readPushState(): PushState | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const { token, checkedAt } = value as Partial<PushState>
    return typeof token === 'string' && token !== '' && typeof checkedAt === 'number'
      ? { token, checkedAt }
      : null
  } catch {
    return null
  }
}

export function savePushState(state: PushState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // No storage (a private window, blocked site data): push is on for this page only.
  }
}

/**
 * Forgets this browser's registration: the stored token, and the browser's push subscription, so
 * nothing more is shown here even when the API could not be told (a session that ended by
 * itself). Asks nothing of the API: a logout sends the token itself, push off unregisters it.
 */
export function clearPushState(): void {
  if (readPushState() === null) return
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
  navigator.serviceWorker
    ?.getRegistration('/')
    .then((registration) => registration?.pushManager?.getSubscription())
    .then((subscription) => subscription?.unsubscribe())
    .catch(() => undefined)
}
