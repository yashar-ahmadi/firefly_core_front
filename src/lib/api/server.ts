import 'server-only'
import { getServerEnv } from '@/config/env'
import { apiPath, encodeBody, sendRequest, type QueryInit } from '@/lib/api/envelope'

export type { QueryInit } from '@/lib/api/envelope'

export interface ApiFetchOptions {
  /** Defaults to GET, or POST when a body is given. */
  method?: string
  query?: QueryInit
  /** Serialised as JSON. */
  body?: unknown
  /** Sent as multipart; takes precedence over `body`. */
  formData?: FormData
  /** Access token: sent as `Authorization: Bearer`. */
  token?: string | null
  /** Guest cart token: sent as `X-Cart-Token`. */
  cartToken?: string | null
  idempotencyKey?: string
  /** Visitor IP for the API's per-IP rate limits (see `getClientIp`). */
  forwardedFor?: string | null
  /**
   * Seconds the Next.js data cache may serve this read. Caching is opt-in:
   * - a positive number caches (with `tags` for `revalidateTag`), unless a token or cart token is
   *   present, since the response is then per user;
   * - `false`, `0`, `undefined` (the default), a token/cart token, or any non-GET/HEAD method
   *   mean `cache: 'no-store'`.
   * `false` therefore means "never cache" here, unlike Next's own `revalidate: false`.
   */
  revalidate?: number | false
  tags?: string[]
  /** Aborts the call. A caller abort is rethrown as is; it is not a network error. */
  signal?: AbortSignal
  /** Default 10000. On expiry the call fails with `ApiError { status: 0, code: 'network_error' }`. */
  timeoutMs?: number
}

export interface ApiFetchResult<T> {
  data: T
  msg: string
  status: number
  headers: Headers
}

const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Call the Firefly API from the server, adding the API key. Returns the unwrapped envelope and the
 * response headers; throws `ApiError` for any non-2xx, non-JSON or unreachable result.
 * The browser must use `bffFetch` instead.
 */
export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<ApiFetchResult<T>> {
  const env = getServerEnv()
  const url = `${env.FIREFLY_API_URL}/api/v1/${apiPath(path, opts.query)}`

  const payload = encodeBody(opts)
  const headers: Record<string, string> = { Accept: 'application/json', ...payload.headers }
  if (env.FIREFLY_API_KEY) headers['X-API-Key'] = env.FIREFLY_API_KEY
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts.cartToken) headers['X-Cart-Token'] = opts.cartToken
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  if (opts.forwardedFor) headers['X-Forwarded-For'] = opts.forwardedFor

  const method = (opts.method ?? (payload.body === undefined ? 'GET' : 'POST')).toUpperCase()
  const cacheable =
    (method === 'GET' || method === 'HEAD') &&
    !opts.token &&
    !opts.cartToken &&
    typeof opts.revalidate === 'number' &&
    opts.revalidate > 0

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const init: RequestInit = {
    method,
    headers,
    body: payload.body,
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    ...(cacheable
      ? { next: { revalidate: opts.revalidate as number, ...(opts.tags && { tags: opts.tags }) } }
      : { cache: 'no-store' }),
  }

  return sendRequest<T>(url, init, opts.signal)
}
