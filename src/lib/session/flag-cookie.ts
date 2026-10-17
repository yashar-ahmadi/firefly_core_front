import { COOKIE } from '@/lib/auth/cookies'

// The session flag cookie as the browser holds it now. Client-side only (reads document.cookie).

const FLAG_COOKIE = new RegExp(`(?:^|;\\s*)${COOKIE.flag}=`)

/**
 * Whether the session flag cookie (`ff_auth`: script-readable, alive exactly as long as the
 * httpOnly refresh cookie) is set: the truth about the session, whatever a page's render says.
 */
export function flagCookieSet(): boolean {
  return FLAG_COOKIE.test(document.cookie)
}
