import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import { decodeJwtExp } from '@/lib/auth/jwt'

/**
 * Session cookie names. `ff_at`, `ff_rt` and `ff_cart` hold credentials and are httpOnly;
 * `ff_auth=1` is a script-readable hint that a session exists (it lives as long as `ff_rt`).
 */
export const COOKIE = {
  access: 'ff_at',
  refresh: 'ff_rt',
  cart: 'ff_cart',
  flag: 'ff_auth',
} as const

export type CookieKey = keyof typeof COOKIE

export type CookieOptions = Omit<ResponseCookie, 'name' | 'value'>

/** The guest cart lives 30 days after its last write on the API, so the cookie does too. */
export const CART_MAX_AGE = 30 * 24 * 60 * 60

/**
 * Attributes for one of our cookies: site-wide, `SameSite=Lax`, httpOnly except the flag, and
 * `Secure` when the site is served over https. A max-age of 0 deletes the cookie.
 */
export function cookieOptions(
  name: CookieKey,
  maxAgeSeconds: number,
  secure: boolean,
): CookieOptions {
  const maxAge = Number.isFinite(maxAgeSeconds) ? Math.max(0, Math.floor(maxAgeSeconds)) : 0
  return { httpOnly: name !== 'flag', secure, sameSite: 'lax', path: '/', maxAge }
}

/**
 * Seconds until the JWT's `exp`, so the cookie dies with the token (this keeps the 7- or 30-day
 * remember-me length of the refresh token). 0 for an expired or unreadable token.
 */
export function tokenMaxAge(token: string, now = Date.now()): number {
  const exp = decodeJwtExp(token)
  if (exp === null) return 0
  return Math.max(0, Math.floor(exp - now / 1000))
}
