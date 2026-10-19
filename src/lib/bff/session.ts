import type { NextRequest, NextResponse } from 'next/server'
import {
  CART_MAX_AGE,
  COOKIE,
  cookieOptions,
  isSessionMarker,
  tokenMaxAge,
  type CookieKey,
} from '@/lib/auth/cookies'

export const REFRESH_PATH = 'account/auth/token/refresh/'
/** A new token pair for the same session: its marker stays. */
export const PASSWORD_CHANGE_PATH = 'account/profile/password/change/'
export const LOGOUT_PATH = 'account/auth/logout/'
export const LOGOUT_ALL_PATH = 'account/auth/logout-all/'
export const MERGE_PATH = 'cart/merge/'

/**
 * The sign-in, registration and recovery forms' calls: they start a session and never need one,
 * so they go with the API key alone (no bearer, no refresh step: see `isKeyOnly`).
 */
const AUTH_ENTRY_PATHS: ReadonlySet<string> = new Set(
  [
    'login/',
    'login/otp/request/',
    'login/otp/verify/',
    'google/',
    'register/start/',
    'register/verify/',
    'register/resend-otp/',
    'register/complete/',
    'password-reset/request/',
    'password-reset/verify-otp/',
    'password-reset/confirm/',
  ].map((rest) => `account/auth/${rest}`),
)

/**
 * Whether the BFF sends `path` with the API key alone: never a bearer, a guest cart token or a
 * refresh step. The refresh and logout endpoints authenticate with the refresh token in their
 * body; the auth forms' (`AUTH_ENTRY_PATHS`) start a session, so a stale refresh cookie left in
 * the browser must not hold them up (a transient refresh failure would answer every sign-in with
 * a 503 until it healed).
 */
export function isKeyOnly(path: string): boolean {
  return path === REFRESH_PATH || path === LOGOUT_PATH || AUTH_ENTRY_PATHS.has(path)
}

/** Codes after which the account can no longer be used: the session must end. */
const ACCOUNT_GONE = new Set(['user_inactive', 'user_not_found'])
/** Codes the refresh endpoint uses for a dead refresh token. */
const REFRESH_DEAD = new Set(['auth_token_invalid', 'token_not_valid'])

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const CART_TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,128}$/
const MAX_JWT_LENGTH = 4096

export function isJwt(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_JWT_LENGTH && JWT_SHAPE.test(value)
}

function isCartToken(value: unknown): value is string {
  return typeof value === 'string' && CART_TOKEN_SHAPE.test(value)
}

export interface SessionCookies {
  access: string | null
  refresh: string | null
  cart: string | null
  /** The session marker the flag cookie holds (`isSessionMarker`). */
  marker: string | null
}

/** A marker for a new login: random, opaque (see `isSessionMarker`). */
export function newSessionMarker(): string {
  return crypto.randomUUID()
}

/**
 * The session cookies of the request. A value that is not shaped like the token it should hold
 * is ignored, so a tampered cookie can never inject header content or a malformed bearer.
 */
export function readSession(req: NextRequest): SessionCookies {
  const read = (key: CookieKey) => req.cookies.get(COOKIE[key])?.value
  const access = read('access')
  const refresh = read('refresh')
  const cart = read('cart')
  const marker = read('flag')
  return {
    access: isJwt(access) ? access : null,
    refresh: isJwt(refresh) ? refresh : null,
    cart: isCartToken(cart) ? cart : null,
    marker: isSessionMarker(marker) ? marker : null,
  }
}

/** Pending cookie changes for one BFF response. The last change to a cookie wins. */
export class CookieJar {
  private readonly changes = new Map<CookieKey, { value: string; maxAge: number }>()

  constructor(private readonly now = Date.now()) {}

  setAccess(access: string): void {
    this.changes.set('access', { value: access, maxAge: tokenMaxAge(access, this.now) })
  }

  /**
   * A token pair: the flag cookie, holding the session's `marker` (a new login's when none is
   * given), lives exactly as long as the refresh cookie. Returns the marker set.
   */
  setSession(access: string, refresh: string, marker: string = newSessionMarker()): string {
    const refreshAge = tokenMaxAge(refresh, this.now)
    this.setAccess(access)
    this.changes.set('refresh', { value: refresh, maxAge: refreshAge })
    this.changes.set('flag', { value: marker, maxAge: refreshAge })
    return marker
  }

  clearSession(): void {
    for (const key of ['access', 'refresh', 'flag'] as const)
      this.changes.set(key, { value: '', maxAge: 0 })
  }

  setCart(token: string): void {
    this.changes.set('cart', { value: token, maxAge: CART_MAX_AGE })
  }

  clearCart(): void {
    this.changes.set('cart', { value: '', maxAge: 0 })
  }

  applyTo(res: NextResponse, secure: boolean): void {
    for (const [key, { value, maxAge }] of this.changes) {
      const options = cookieOptions(key, maxAge, secure)
      // A deletion must repeat Path=/ or the browser keeps the site-wide cookie.
      res.cookies.set(
        COOKIE[key],
        value,
        maxAge === 0 ? { ...options, expires: new Date(0) } : options,
      )
    }
  }
}

export interface Exchange {
  /** Normalised API path, e.g. `cart/item/add/`. */
  path: string
  status: number
  /** The parsed envelope (changed in place), or null for empty and failed answers. */
  body: Record<string, unknown> | null
  /** Whether the final attempt carried a bearer / a cart token. */
  sentAccess: boolean
  sentCart: boolean
  /** The request's session marker (`SessionCookies.marker`). */
  marker: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorCodes(data: Record<string, unknown> | null): string[] {
  if (!data || !Array.isArray(data.errors)) return []
  return data.errors.flatMap((item) =>
    isRecord(item) && typeof item.code === 'string' ? [item.code] : [],
  )
}

/**
 * Move credentials from the API answer into cookies and out of the body the browser receives,
 * and end or adjust the session as the answer requires.
 */
export function captureSession(exchange: Exchange, jar: CookieJar): void {
  const { path, status } = exchange
  const ok = status >= 200 && status < 300
  const data = isRecord(exchange.body?.data) ? exchange.body.data : null
  const codes = errorCodes(data)

  // Login, OTP login, Google, registration complete: a fresh pair, a new session marker. A
  // password change: a fresh pair for the same session, which keeps its marker.
  if (data && 'tokens' in data) {
    const tokens = data.tokens
    if (ok && isRecord(tokens) && isJwt(tokens.access) && isJwt(tokens.refresh)) {
      const kept = path === PASSWORD_CHANGE_PATH ? exchange.marker : null
      jar.setSession(tokens.access, tokens.refresh, kept ?? undefined)
    }
    delete data.tokens
  }

  if (path === REFRESH_PATH) {
    if (data && 'access' in data) {
      if (ok && isJwt(data.access)) jar.setAccess(data.access)
      delete data.access
    }
    if (codes.some((code) => REFRESH_DEAD.has(code))) jar.clearSession()
  }

  if (
    path === LOGOUT_PATH ||
    path === LOGOUT_ALL_PATH ||
    codes.some((code) => ACCOUNT_GONE.has(code))
  ) {
    jar.clearSession()
  }

  if (path.startsWith('cart/')) captureCart(exchange, data, codes, jar)
}

function captureCart(
  { path, status, sentAccess, sentCart }: Exchange,
  data: Record<string, unknown> | null,
  codes: string[],
  jar: CookieJar,
): void {
  const ok = status >= 200 && status < 300
  if (data && 'token' in data) {
    // A signed-in answer carries the user cart's token, which is useless to a guest: never keep it.
    if (ok && !sentAccess) {
      if (isCartToken(data.token)) jar.setCart(data.token)
      else if (data.token === '' && sentCart) jar.clearCart()
    }
    delete data.token
  }
  // The guest cart behind the cookie is gone (expired, merged or deactivated).
  if (!sentAccess && sentCart && codes.includes('cart_not_found')) jar.clearCart()
  // After a merge the guest token is dead; it must never be sent again.
  if (path === MERGE_PATH && ok) jar.clearCart()
}
