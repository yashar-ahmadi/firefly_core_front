import type { NextRequest } from 'next/server'
import type { QueryInit } from '@/lib/api/envelope'
import type { SessionCookies } from '@/lib/bff/session'

/**
 * A payment's calls made without the session (order digest §3.2.5, §3.2.7–3.2.8, §11 #7): signed
 * in, the API refuses another account's payment (403 `payment_forbidden`, e.g. a guest order paid
 * through its link by a signed-in visitor) while it answers the same call made anonymously, so
 * the payment pages ask again with `?anon=1`. Exactly three calls honour the flag:
 * - `GET payment/<uuid>/status/` (the result page, the card-transfer page);
 * - `GET payment/<uuid>/card-transfer/` (the cards);
 * - `POST payment/<uuid>/card-transfer/receipt/` (the receipt, multipart: still streamed under
 *   the 6 MiB cap).
 * They go with no session at all (no bearer, no cart token, no refresh, no cookie set or
 * cleared) and the flag stays here. Anywhere else the flag means nothing and is forwarded as it
 * came.
 */

export const ANON_FLAG = 'anon'

const PAYMENT = '^payment\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\/'

/** The calls that may go without the session, by method. */
const ANONYMOUS: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'GET', path: new RegExp(`${PAYMENT}status\\/$`, 'i') },
  { method: 'GET', path: new RegExp(`${PAYMENT}card-transfer\\/$`, 'i') },
  { method: 'POST', path: new RegExp(`${PAYMENT}card-transfer\\/receipt\\/$`, 'i') },
]

/** No session cookies: what an anonymous call is sent with. */
export const NO_SESSION: SessionCookies = { access: null, refresh: null, cart: null, marker: null }

/** Whether this request is one of the payment calls above, asked for without the session. */
export function isAnonymousCall(req: NextRequest, method: string, path: string): boolean {
  return (
    req.nextUrl.searchParams.get(ANON_FLAG) === '1' &&
    ANONYMOUS.some((call) => call.method === method && call.path.test(path))
  )
}

/** `query` without the flag (every value of it). */
export function withoutAnonFlag(query: QueryInit): QueryInit {
  return Object.fromEntries(Object.entries(query).filter(([key]) => key !== ANON_FLAG))
}
