import { ApiError } from '@/lib/api/errors'

export type QueryValue = string | number | boolean | Array<string | number> | null | undefined
export type QueryInit = Record<string, QueryValue>

export interface ParsedResponse<T> {
  data: T
  msg: string
  status: number
}

function decodeSafely(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function encodePath(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  const encoded = segments.map((segment) => {
    const decoded = decodeSafely(segment)
    // A dot segment would let `fetch` normalise the URL out of /api/v1/ (or /api/bff/).
    if (decoded === '.' || decoded === '..') {
      throw new RangeError('API path must not contain "." or ".." segments')
    }
    return encodeURIComponent(decoded)
  })
  return encoded.length > 0 ? `${encoded.join('/')}/` : ''
}

function encodeQuery(query: QueryInit): string {
  const pairs: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
    }
  }
  return pairs.join('&')
}

/**
 * Normalise a relative API path: each segment is decoded (when valid) and encoded exactly once,
 * so already-encoded input is not double-encoded; repeated and leading slashes are dropped; the
 * result always ends with one `/`. Query arrays repeat the key, `null`/`undefined` are dropped.
 * Pass the query through `query`, never inside `path`. No leading slash in the result.
 */
export function apiPath(path: string, query?: QueryInit): string {
  const base = encodePath(path)
  const search = query ? encodeQuery(query) : ''
  return search ? `${base}?${search}` : base
}

/**
 * Turn a fetch Response into `{ data, msg, status }`, or throw an ApiError.
 * 204 gives `data: null`. The body is parsed whatever its declared content type, so a JSON body
 * behind a wrong header still works; anything that is not a JSON object (HTML from a proxy or
 * the dev server) becomes `non_json_response`. A non-2xx JSON body becomes an ApiError built
 * from `data.errors`.
 */
export async function parseResponse<T>(res: Response): Promise<ParsedResponse<T>> {
  if (res.status === 204) return { data: null as T, msg: '', status: 204 }

  let text: string
  try {
    text = await res.text()
  } catch (cause) {
    throw ApiError.network(cause)
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw ApiError.nonJson(res.status)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw ApiError.nonJson(res.status)
  }
  const envelope = body as Record<string, unknown>

  if (!res.ok) {
    throw ApiError.fromBody(res.status, envelope, res.headers.get('retry-after'))
  }
  return {
    data: ('data' in envelope ? envelope.data : null) as T,
    msg: typeof envelope.msg === 'string' ? envelope.msg : '',
    status: res.status,
  }
}

export interface EncodedBody {
  body: BodyInit | undefined
  /** Headers the body needs. FormData gets none: fetch adds the multipart boundary itself. */
  headers: Record<string, string>
}

/** `formData` is sent as multipart, a defined `body` as JSON, otherwise there is no body. */
export function encodeBody(opts: { body?: unknown; formData?: FormData }): EncodedBody {
  if (opts.formData) return { body: opts.formData, headers: {} }
  if (opts.body !== undefined) {
    return { body: JSON.stringify(opts.body), headers: { 'Content-Type': 'application/json' } }
  }
  return { body: undefined, headers: {} }
}

/**
 * A 3xx, or the opaque redirect a browser returns for `redirect: 'manual'`. Callers that send
 * the API key use `redirect: 'manual'`, so a redirect surfaces here instead of being followed.
 */
export function isRedirect(res: Response): boolean {
  return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)
}

/**
 * fetch + parseResponse with the shared failure model: a rejected fetch (DNS, refused, reset,
 * timeout) becomes `ApiError { status: 0, code: 'network_error' }`. An abort requested by the
 * caller's own `signal` is not a connectivity problem and propagates unchanged, so React Query
 * and unmounting components can cancel quietly. A redirect response becomes
 * `ApiError { status: 502, code: 'upstream_redirect' }`.
 */
export async function sendRequest<T>(
  url: string,
  init: RequestInit,
  callerSignal?: AbortSignal,
): Promise<ParsedResponse<T> & { headers: Headers }> {
  try {
    const res = await fetch(url, init)
    if (isRedirect(res)) throw ApiError.upstreamRedirect()
    const parsed = await parseResponse<T>(res)
    return { ...parsed, headers: res.headers }
  } catch (error) {
    if (error instanceof ApiError && error.status !== 0) throw error
    if (callerSignal?.aborted) throw error instanceof ApiError ? (error.cause ?? error) : error
    throw error instanceof ApiError ? error : ApiError.network(error)
  }
}
