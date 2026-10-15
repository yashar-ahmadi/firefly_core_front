/** Unsigned test JWTs: the storefront only decodes `exp`, it never verifies signatures. */
export function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

export function makeJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  return `${header}.${base64url(JSON.stringify(payload))}.c2lnbmF0dXJl`
}

/** A JWT whose `exp` is `secondsFromNow` after `now` (milliseconds). */
export function jwtExpiringIn(secondsFromNow: number, now = Date.now(), extra = {}): string {
  return makeJwt({ exp: Math.floor(now / 1000) + secondsFromNow, ...extra })
}
