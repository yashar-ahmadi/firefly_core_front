/**
 * JWT helpers for scheduling refreshes and cookie lifetimes. Pure and runtime-agnostic (Node and
 * edge). The signature is never checked: the API verifies every token it receives, and the
 * storefront only needs `exp`, the one claim the API guarantees.
 */

const BASE64URL = /^[A-Za-z0-9_-]+$/

function decodeBase64Url(segment: string): string | null {
  if (!BASE64URL.test(segment)) return null
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  try {
    return atob(padded)
  } catch {
    return null
  }
}

/** The `exp` claim in seconds since the epoch, or null when the token is not a readable JWT. */
export function decodeJwtExp(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const json = decodeBase64Url(parts[1] ?? '')
  if (json === null) return null
  let payload: unknown
  try {
    payload = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const exp = (payload as Record<string, unknown>).exp
  return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
}

/**
 * True when the token is missing, unreadable, or expires within `skewSeconds` of `now` (ms).
 * The skew absorbs request latency and small clock differences with the API.
 */
export function isExpiring(
  token: string | null | undefined,
  skewSeconds = 30,
  now = Date.now(),
): boolean {
  if (!token) return true
  const exp = decodeJwtExp(token)
  if (exp === null) return true
  return exp * 1000 - now <= skewSeconds * 1000
}
