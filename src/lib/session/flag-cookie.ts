import { COOKIE } from '@/lib/auth/cookies'

// The session flag cookie as the browser holds it now. Client-side only (reads document.cookie).

const FLAG_COOKIE = new RegExp(`(?:^|;\\s*)${COOKIE.flag}=([^;]*)`)

/**
 * Whether the session flag cookie (`ff_auth`: script-readable, alive exactly as long as the
 * httpOnly refresh cookie) is set: the truth about the session, whatever a page's render says.
 */
export function flagCookieSet(): boolean {
  return FLAG_COOKIE.test(document.cookie)
}

/**
 * The session flag cookie's value, the marker of the login the session began with (a new one
 * for every login: see `isSessionMarker`), or null without a session.
 */
export function flagCookieValue(): string | null {
  return FLAG_COOKIE.exec(document.cookie)?.[1] ?? null
}
