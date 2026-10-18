import type { NextRequest } from 'next/server'
import type { QueryInit } from '@/lib/api/envelope'
import type { SessionCookies } from '@/lib/bff/session'

/**
 * A payment's status read without the session (order digest §3.2.5, §11 #7): signed in, the API
 * refuses another account's payment (403 `payment_forbidden`, e.g. a guest order paid through its
 * link) while it answers the same read made anonymously, so the result page asks again with
 * `?anon=1`. Only `GET payment/<uuid>/status/` honours the flag: that call goes with no session
 * at all (no bearer, no cart token, no refresh, no cookie set or cleared) and the flag stays here.
 * Anywhere else the flag means nothing and is forwarded as it came.
 */

export const ANON_FLAG = 'anon'

const STATUS_PATH =
  /^payment\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/status\/$/i

/** No session cookies: what an anonymous status read is sent with. */
export const NO_SESSION: SessionCookies = { access: null, refresh: null, cart: null, marker: null }

/** Whether this request is a payment's status read asked for without the session. */
export function isAnonymousRead(req: NextRequest, method: string, path: string): boolean {
  return (
    method === 'GET' && STATUS_PATH.test(path) && req.nextUrl.searchParams.get(ANON_FLAG) === '1'
  )
}

/** `query` without the flag (every value of it). */
export function withoutAnonFlag(query: QueryInit): QueryInit {
  return Object.fromEntries(Object.entries(query).filter(([key]) => key !== ANON_FLAG))
}
