import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { getServerEnv } from '@/config/env'
import { ApiError, isApiNotFound } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { COOKIE } from '@/lib/auth/cookies'
import { isJwt } from '@/lib/bff/session'
import { getClientIp } from '@/lib/http/client-ip'

// An account order read on the server for its page's first render (order digest §3.1.3):
// `GET order/<code>/` with the visitor's session (the proxy has refreshed an expiring access
// token before the page renders), never cached (per visitor), with the visitor's IP. One read
// per request: React `cache` shares it between the page's metadata and the page. Never throws:
// - found: the page renders it;
// - missing: the API answered 404 (not this account's, or none): the page is a real 404;
// - unknown: no usable token here, or no answer: the page reads it in the browser (through the
//   BFF, which refreshes the session), and a 404 there is said in the page.
// The order's uuid and link are credentials: a failure is logged with its status and code only.

export type AccountOrderRead =
  { kind: 'found'; order: OrderDetail } | { kind: 'missing' } | { kind: 'unknown' }

const TIMEOUT_MS = 8_000

export const readAccountOrder = cache(async (code: string): Promise<AccountOrderRead> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
  const access = cookieStore.get(COOKIE.access)?.value
  if (!isJwt(access)) return { kind: 'unknown' }
  try {
    const { data } = await apiFetch<OrderDetail>(`order/${code}/`, {
      token: access,
      forwardedFor: getClientIp(headerList, getServerEnv().CLIENT_IP_HEADER),
      timeoutMs: TIMEOUT_MS,
    })
    return { kind: 'found', order: data }
  } catch (error) {
    if (isApiNotFound(error)) return { kind: 'missing' }
    if (!(error instanceof ApiError && error.status === 401)) {
      const what = error instanceof ApiError ? `${error.status} ${error.code}` : 'unexpected'
      console.error('[account-order] the order could not be read:', what)
    }
    return { kind: 'unknown' }
  }
})
