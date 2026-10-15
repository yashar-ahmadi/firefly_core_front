import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { getServerEnv } from '@/config/env'
import { apiPath } from '@/lib/api/envelope'
import { NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import { isExpiring } from '@/lib/auth/jwt'
import { refreshAccess } from '@/lib/auth/refresh'
import { isAllowed } from '@/lib/bff/allowlist'
import {
  RequestTooLargeError,
  passesCsrf,
  queryOf,
  readBody,
  type JsonRewrite,
  type OutgoingBody,
} from '@/lib/bff/inbound'
import {
  CSRF_DETAIL,
  NOT_FOUND_DETAIL,
  TOO_LARGE_DETAIL,
  emptyResponse,
  errorResponse,
  jsonResponse,
} from '@/lib/bff/responses'
import {
  CookieJar,
  LOGOUT_PATH,
  MERGE_PATH,
  REFRESH_PATH,
  captureSession,
  readSession,
} from '@/lib/bff/session'
import { callUpstream, type UpstreamResult } from '@/lib/bff/upstream'
import { getClientIp } from '@/lib/http/client-ip'

/** 401 codes that mean "the access token is stale": refresh once, then retry once. */
const STALE_ACCESS = new Set(['token_not_valid', 'authentication_failed'])
/** On `cart/merge/`, a bearer the API no longer accepts reads as "log in first". */
const STALE_ACCESS_ON_MERGE = 'cart_token_required'
const JSON_TIMEOUT_MS = 15_000
const UPLOAD_TIMEOUT_MS = 60_000

/** `segments` as a normalised API path (`a/b/`), or null when it holds `.` or `..`. */
function normalise(segments: string[]): string | null {
  try {
    return apiPath(segments.join('/'))
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
}

/** Logout sends the refresh cookie; the managed refresh path sends only the refresh cookie. */
function bodyRewrite(path: string, refresh: string | null): JsonRewrite | undefined {
  if (path === LOGOUT_PATH) {
    return (client) => {
      // Only the cookie decides which refresh token is revoked; keep e.g. `registration_id`.
      const rest = { ...client }
      delete rest.refresh
      return refresh ? { ...rest, refresh } : rest
    }
  }
  if (path === REFRESH_PATH) return () => (refresh ? { refresh } : {})
  return undefined
}

function isStaleAccess(result: UpstreamResult, path: string): boolean {
  if (result.kind !== 'json' || result.status !== 401) return false
  const data = result.body.data as { errors?: Array<{ code?: unknown }> } | undefined
  const code = Array.isArray(data?.errors) ? data.errors[0]?.code : undefined
  if (typeof code !== 'string') return false
  return STALE_ACCESS.has(code) || (path === MERGE_PATH && code === STALE_ACCESS_ON_MERGE)
}

function toResponse(result: UpstreamResult): NextResponse {
  if (result.kind === 'empty') return emptyResponse(result.status, result.retryAfter)
  if (result.kind === 'error') {
    return errorResponse(result.status, result.code, NETWORK_ERROR_DETAIL, result.retryAfter)
  }
  return jsonResponse(result.status, result.body, result.retryAfter)
}

function tooLarge(): NextResponse {
  return errorResponse(413, 'request_too_large', TOO_LARGE_DETAIL)
}

/**
 * The browser's only door to the Firefly API. See the route file for the full contract.
 *
 * Token refresh happens at most once per request: before the call when `ff_at` is missing or
 * about to expire (and `ff_rt` exists), otherwise after a `401 token_not_valid`, followed by one
 * retry (`401 cart_token_required` on `cart/merge/` counts as stale too, when a bearer was sent).
 * A streamed upload cannot be replayed, so it is not retried. If the refresh token is
 * rejected, the session cookies are cleared and the call goes out without a bearer: the API
 * answers public paths as a guest and auth-required paths with its own 401, which is relayed.
 */
export async function handleBff(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const env = getServerEnv()
  const method = req.method.toUpperCase()
  const path = normalise(segments)
  if (path === null || !isAllowed(method, path)) {
    return errorResponse(404, 'not_found', NOT_FOUND_DETAIL)
  }
  if (!passesCsrf(req, method, env.SITE_URL)) {
    return errorResponse(403, 'csrf_failed', CSRF_DETAIL)
  }

  const url = `${env.FIREFLY_API_URL}/api/v1/${apiPath(path, queryOf(req))}`
  const forwardedFor = getClientIp(req.headers, env.CLIENT_IP_HEADER)
  const cookies = readSession(req)
  const jar = new CookieJar()
  // The refresh and logout endpoints authenticate with the API key alone.
  const keyOnly = path === REFRESH_PATH || path === LOGOUT_PATH
  let body: OutgoingBody
  try {
    body = await readBody(req, method, bodyRewrite(path, cookies.refresh))
  } catch (error) {
    if (error instanceof RequestTooLargeError) return tooLarge()
    throw error
  }

  let access = keyOnly ? null : cookies.access
  let refreshed = false
  const refresh = async (): Promise<boolean> => {
    if (refreshed || !cookies.refresh) return false
    refreshed = true
    const result = await refreshAccess(cookies.refresh, forwardedFor)
    if ('access' in result) {
      access = result.access
      jar.setAccess(result.access)
      return true
    }
    if (result.error !== 'network') {
      access = null
      jar.clearSession()
    }
    return false
  }

  if (!keyOnly && cookies.refresh && isExpiring(access)) await refresh()

  const send = async () => {
    const sentAccess = access !== null
    // A guest cart token goes only with guest calls, and once to the merge after login; never to
    // the key-only logout and refresh endpoints.
    const cartToken =
      cookies.cart && !keyOnly && (!sentAccess || path === MERGE_PATH) ? cookies.cart : null
    const headers = upstreamHeaders(env.FIREFLY_API_KEY, access, cartToken, forwardedFor, req, body)
    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
      body: body.body,
      signal: AbortSignal.timeout(body.streamed ? UPLOAD_TIMEOUT_MS : JSON_TIMEOUT_MS),
      ...(body.streamed && { duplex: 'half' }),
    }
    return { result: await callUpstream(url, init), sentAccess, sentCart: cartToken !== null }
  }

  let attempt = await send()
  if (
    attempt.sentAccess &&
    body.replayable &&
    isStaleAccess(attempt.result, path) &&
    (await refresh())
  ) {
    attempt = await send()
  }

  let response: NextResponse
  if (body.overflowed()) {
    response = tooLarge()
  } else {
    const { result, sentAccess, sentCart } = attempt
    const json = result.kind === 'json' ? result.body : null
    captureSession({ path, status: result.status, body: json, sentAccess, sentCart }, jar)
    response = toResponse(result)
  }
  jar.applyTo(response, new URL(env.SITE_URL).protocol === 'https:')
  return response
}

function upstreamHeaders(
  apiKey: string,
  access: string | null,
  cartToken: string | null,
  forwardedFor: string | null,
  req: NextRequest,
  body: OutgoingBody,
): Headers {
  // Built from scratch: nothing from the browser is forwarded except the Idempotency-Key.
  const headers = new Headers({ Accept: 'application/json', ...body.headers })
  if (apiKey) headers.set('X-API-Key', apiKey)
  if (access) headers.set('Authorization', `Bearer ${access}`)
  if (cartToken) headers.set('X-Cart-Token', cartToken)
  if (forwardedFor) headers.set('X-Forwarded-For', forwardedFor)
  const idempotencyKey = req.headers.get('idempotency-key')
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  return headers
}
