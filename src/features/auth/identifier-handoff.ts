import { prefilledIdentifier } from './identifier'

// What the visitor typed on one auth page, handed to the auth page they go to next by one of its
// links (registration offered by login, recovery from login's password step, login after a
// recovery or for an identifier already taken). Never in the URL: an email address or a mobile
// number there would reach the history, the server logs, the Referer of the next request and the
// operator's analytics (a page view sends its full URL). Kept in this tab's session storage (in
// memory too, for when storage is blocked: the next page comes by a client navigation), taken by
// the page it was handed to, which clears it. No React: safe in any bundle.

/** The auth pages an identifier can be handed to. */
export type AuthPage = '/login/' | '/register/' | '/forgot-password/'

interface Handoff {
  page: AuthPage
  identifier: string
}

const KEY = 'ff_handoff'

let memory: Handoff | null = null

function isHandoff(value: unknown): value is Handoff {
  if (typeof value !== 'object' || value === null) return false
  const { page, identifier } = value as Partial<Handoff>
  return typeof page === 'string' && typeof identifier === 'string'
}

function stored(): Handoff | null | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return null
    const value: unknown = JSON.parse(raw)
    return isHandoff(value) ? value : null
  } catch {
    // Blocked storage (the memory copy answers) or a value that is not ours.
    return undefined
  }
}

/** Hands `identifier` to `page`, the auth page about to be shown (replacing any earlier one). */
export function handOffIdentifier(page: AuthPage, identifier: string): void {
  memory = { page, identifier }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    // No storage: the memory copy is enough for a client navigation.
  }
}

/**
 * The identifier handed to `page`, normalised, when it is an email address or a mobile number
 * (`prefilledIdentifier`), else ''. Reading it changes nothing.
 */
export function peekIdentifier(page: AuthPage): string {
  const handoff = stored() ?? memory
  if (!handoff || handoff.page !== page) return ''
  return prefilledIdentifier(handoff.identifier)
}

/** Forgets any handoff: what was typed stays on the page that took it, and nowhere else. */
export function clearIdentifierHandoff(): void {
  memory = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
}

// The identifier the page on screen took, kept while it is mounted (`useHandedIdentifier`): its
// renders read it again after the handoff itself is gone. One page at a time.
let taken: Handoff | null = null

/**
 * The identifier handed to `page` (see `peekIdentifier`), taken: the handoff is cleared, and the
 * same value answers every later call for `page` until `releaseIdentifier(page)`. A handoff to
 * another page is left for it.
 */
export function takeIdentifier(page: AuthPage): string {
  if (taken?.page === page) return taken.identifier
  const identifier = peekIdentifier(page)
  if (identifier === '') return ''
  clearIdentifierHandoff()
  taken = { page, identifier }
  return identifier
}

/** Keeps `identifier` as what `page` took (again: a remount of the same page). */
export function keepIdentifier(page: AuthPage, identifier: string): void {
  if (identifier !== '') taken = { page, identifier }
}

/** `page` is gone: what it took is forgotten (its next visit starts empty). */
export function releaseIdentifier(page: AuthPage): void {
  if (taken?.page === page) taken = null
}
