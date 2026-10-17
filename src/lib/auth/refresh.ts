import 'server-only'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'

export type RefreshResult =
  | { access: string }
  | { error: 'invalid' | 'inactive' }
  /** Nothing said about the session; `retryAfter`: seconds, when a 429 said so. */
  | { error: 'network'; retryAfter: number | null }

const REFRESH_TIMEOUT_MS = 5_000

/** The refresh token itself is dead: expired, revoked, malformed or missing. */
const INVALID_CODES = new Set(['auth_token_invalid', 'token_not_valid'])
/** The account was disabled or deleted. Never retry. */
const INACTIVE_CODES = new Set(['user_inactive', 'user_not_found'])

function classify(error: unknown): 'invalid' | 'inactive' | 'network' {
  if (!(error instanceof ApiError)) return 'network'
  if (INACTIVE_CODES.has(error.code)) return 'inactive'
  if (INVALID_CODES.has(error.code)) return 'invalid'
  // `400 required` and friends on the `refresh` field: the cookie holds no usable token.
  if (error.status === 400 && error.errors.some((item) => item.attr === 'refresh')) return 'invalid'
  // Everything else (no connection, 5xx, 429, a misconfigured API key, a redirect) says nothing
  // about the session, so the caller must keep the cookies.
  return 'network'
}

/**
 * Exchange the refresh token for a new access token (`POST account/auth/token/refresh/`).
 * Refresh tokens do not rotate: keep the same `ff_rt`. Only `invalid` and `inactive` mean the
 * session is over; `network` covers every transient or configuration failure.
 */
export async function refreshAccess(
  refresh: string,
  forwardedFor: string | null,
): Promise<RefreshResult> {
  try {
    const { data } = await apiFetch<{ access?: unknown }>('account/auth/token/refresh', {
      method: 'POST',
      body: { refresh },
      forwardedFor,
      timeoutMs: REFRESH_TIMEOUT_MS,
    })
    return typeof data?.access === 'string' && data.access !== ''
      ? { access: data.access }
      : { error: 'network', retryAfter: null }
  } catch (error) {
    const kind = classify(error)
    if (kind !== 'network') return { error: kind }
    return { error: kind, retryAfter: error instanceof ApiError ? error.retryAfter : null }
  }
}
