// This browser's web push registration (dashboard digest §4.3): the FCM token sent to `devices/`,
// whose account it was sent for, and when it was last checked against Firebase. Its presence is
// the "push is on" flag. Kept in localStorage; without storage push simply reads as off. No
// React, no Firebase: it is part of every shop page (the re-register effect), login, logout and
// the session's end.
//
// Push steps run over the network (a token check, a re-register): a disable or a logout must not
// be undone by one that was already on its way. Each step takes a mark (`pushMark`) with the
// registration it read, checks it (`stillCurrent`) right before every write, and is tracked
// (`trackPushWork`) so a disable can wait for it; forgetting the registration, or
// `abandonPushWork`, moves the mark on.

export interface PushState {
  /** The FCM registration token, as `devices/` received it. */
  token: string
  /** The account it was registered for (`UserProfile.uuid`): never posted for another one. */
  owner: string
  /** When Firebase last confirmed the token, or last failed to (ms). */
  checkedAt: number
}

const KEY = 'ff_push'

let generation = 0
const pending = new Set<Promise<unknown>>()

export function readPushState(): PushState | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const { token, owner, checkedAt } = value as Partial<PushState>
    return typeof token === 'string' &&
      token !== '' &&
      typeof owner === 'string' &&
      owner !== '' &&
      typeof checkedAt === 'number'
      ? { token, owner, checkedAt }
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

/** The registration as it is now, for a step to check before it writes (`stillCurrent`). */
export function pushMark(): number {
  return generation
}

/** Whether `stored` is still this browser's registration, nothing forgotten or abandoned since `mark`. */
export function stillCurrent(stored: PushState, mark: number): boolean {
  return generation === mark && readPushState()?.token === stored.token
}

/** Every push step on its way stops before its next write (a disable, a logout). */
export function abandonPushWork(): void {
  generation += 1
}

/** Runs `work` so that `settlePushWork` waits for it. */
export function trackPushWork<T>(work: Promise<T>): Promise<T> {
  pending.add(work)
  const done = () => pending.delete(work)
  work.then(done, done)
  return work
}

/** Resolves once every tracked push step has settled, or after `limitMs` whatever they do. */
export async function settlePushWork(limitMs = 5_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<void>((resolve) => (timer = setTimeout(resolve, limitMs)))
  await Promise.race([Promise.allSettled([...pending]), limit])
  clearTimeout(timer)
}

/**
 * Forgets this browser's registration: steps on their way stop, the stored token goes, and so
 * does the browser's push subscription (whether or not anything was stored: without storage push
 * was on for one page only), so nothing more is shown here even when the API could not be told
 * (a session that ended by itself, another account signing in). Asks nothing of the API: a
 * logout sends the token itself, push off unregisters it.
 */
export function clearPushState(): void {
  abandonPushWork()
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

/**
 * The registration when it is `owner`'s (the signed-in account's uuid). Another account's is
 * forgotten at once, its subscription with it: nothing of it is ever posted for this one.
 */
export function ownedPushState(owner: string): PushState | null {
  const stored = readPushState()
  if (stored && stored.owner !== owner) {
    clearPushState()
    return null
  }
  return stored
}
