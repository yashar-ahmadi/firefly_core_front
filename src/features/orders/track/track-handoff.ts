import { findGuestOrderByToken } from '../guest-orders'
import { isOrderCode, normalizeOrderCode } from './order-code'

// An order's code handed to the tracking page by the page that links to it (the thanks page, the
// payment link's refusals, the payment result, the card transfer): never in the URL, since a code
// with a mobile number is a lookup key (and the URL reaches the history, the logs and the
// operator's analytics). Kept in this tab's session storage (in memory too, for a blocked
// storage and a client navigation), taken once by the tracking page, which clears it. No mobile
// is ever handed. No React: safe in any bundle (the shape of Plan 3's identifier handoff).

const KEY = 'ff_track_code'

let memory: string | null = null

function stored(): string | null | undefined {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    // Blocked storage: the memory copy answers.
    return undefined
  }
}

/** Hands `orderCode` to the tracking page about to be shown (an order code only). */
export function handOffOrderCode(orderCode: string): void {
  const code = normalizeOrderCode(orderCode)
  if (!isOrderCode(code)) return
  memory = code
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    // No storage: the memory copy is enough for a client navigation.
  }
}

/** The code of the guest order whose payment link holds `token` (this device's), or null. */
export const orderCodeForToken = (token: string): string | null =>
  findGuestOrderByToken(token)?.orderCode ?? null

/** The code handed over, or ''. Reading it changes nothing. */
export function peekOrderCode(): string {
  const value = stored() ?? memory
  return value && isOrderCode(value) ? value : ''
}

/** Forgets any handoff. */
export function clearOrderCodeHandoff(): void {
  memory = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
}

// The code the page on screen took, kept while it is mounted: its renders read it again after
// the handoff itself is gone.
let taken: string | null = null

/** The code handed over, taken: cleared, and the same value answers until `releaseOrderCode`. */
export function takeOrderCode(): string {
  if (taken !== null) return taken
  const code = peekOrderCode()
  if (code === '') return ''
  clearOrderCodeHandoff()
  taken = code
  return code
}

/** Kept again as what the page took (a remount of the same page). */
export function keepOrderCode(code: string): void {
  if (code !== '') taken = code
}

/** The page is gone: what it took is forgotten (its next visit starts empty). */
export function releaseOrderCode(): void {
  taken = null
}
