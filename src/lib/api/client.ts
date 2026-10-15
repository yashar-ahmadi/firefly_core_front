import { apiPath, encodeBody, sendRequest, type QueryInit } from '@/lib/api/envelope'

export interface BffFetchOptions {
  /** Defaults to GET, or POST when a body is given. */
  method?: string
  query?: QueryInit
  /** Serialised as JSON. */
  body?: unknown
  /** Sent as multipart; the browser adds the boundary. Takes precedence over `body`. */
  formData?: FormData
  idempotencyKey?: string
  signal?: AbortSignal
}

export interface BffFetchResult<T> {
  data: T
  msg: string
  status: number
}

/**
 * Browser-side twin of `apiFetch`: calls our own `/api/bff/<path>/`, which adds the API key and
 * reads the httpOnly session cookies. Same errors: `ApiError` for non-2xx, non-JSON and network
 * failures. Safe to import from Client Components (no server-only code, no environment).
 * `X-Requested-With: ff` is the CSRF marker the BFF requires on every request.
 */
export async function bffFetch<T>(
  path: string,
  opts: BffFetchOptions = {},
): Promise<BffFetchResult<T>> {
  const payload = encodeBody(opts)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'ff',
    ...payload.headers,
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  const init: RequestInit = {
    method: (opts.method ?? (payload.body === undefined ? 'GET' : 'POST')).toUpperCase(),
    headers,
    body: payload.body,
    signal: opts.signal,
  }
  const { data, msg, status } = await sendRequest<T>(
    `/api/bff/${apiPath(path, opts.query)}`,
    init,
    opts.signal,
  )
  return { data, msg, status }
}
