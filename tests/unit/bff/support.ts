import { vi, type MockInstance } from 'vitest'
import { NextRequest } from 'next/server'

export const API = 'https://api.test/api/v1/'
export const SITE = 'https://shop.test'
export const REFRESH_URL = `${API}account/auth/token/refresh/`

export type FetchSpy = MockInstance<typeof fetch>
export interface Call {
  url: string
  init: RequestInit
  headers: Headers
}

export function envelope(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ msg: 'm', code: status, data }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

export function failure(status: number, code: string, extra: Record<string, unknown> = {}) {
  return envelope(
    { type: 'client_error', errors: [{ code, detail: 'جزئیات', attr: null }], ...extra },
    status,
  )
}

export function stubEnv(siteUrl = SITE): void {
  vi.stubEnv('FIREFLY_API_URL', 'https://api.test')
  vi.stubEnv('FIREFLY_API_KEY', 'key-123')
  vi.stubEnv('SITE_URL', siteUrl)
  vi.stubEnv('CLIENT_IP_HEADER', 'x-real-ip')
}

/** Fresh module graph per test so the memoized env picks up the stubs. */
export async function loadHandler() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return (await import('@/lib/bff/handler')).handleBff
}

export function calls(spy: FetchSpy): Call[] {
  return spy.mock.calls.map(([input, init]) => ({
    url: String(input),
    init: init ?? {},
    headers: new Headers(init?.headers),
  }))
}

export function upstreamCalls(spy: FetchSpy): Call[] {
  return calls(spy).filter((call) => call.url !== REFRESH_URL)
}

export function refreshCalls(spy: FetchSpy): Call[] {
  return calls(spy).filter((call) => call.url === REFRESH_URL)
}

export interface BffInit {
  method?: string
  headers?: Record<string, string>
  cookies?: Record<string, string>
  json?: unknown
  body?: BodyInit
  /** Defaults to true for writes: adds `X-Requested-With: ff`. */
  csrf?: boolean
}

/** A request to /api/bff/<path> plus the catch-all segments Next would pass. */
export function bff(path: string, init: BffInit = {}): [NextRequest, string[]] {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers({ host: 'shop.test', 'x-real-ip': '203.0.113.9', ...init.headers })
  if ((init.csrf ?? method !== 'GET') && !headers.has('x-requested-with')) {
    headers.set('x-requested-with', 'ff')
  }
  if (init.cookies) {
    headers.set(
      'cookie',
      Object.entries(init.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; '),
    )
  }
  let body = init.body
  if (init.json !== undefined) {
    body = JSON.stringify(init.json)
    headers.set('content-type', 'application/json')
  }
  const [pathname, search = ''] = path.split('?')
  const url = `${SITE}/api/bff/${pathname}${search ? `?${search}` : ''}`
  const request = new NextRequest(url, { method, headers, body })
  return [request, (pathname ?? '').split('/').filter(Boolean)]
}

export interface ParsedCookie {
  value: string
  attrs: Record<string, string | true>
}

/** Set-Cookie headers of a response, keyed by cookie name, attribute names lower-cased. */
export function setCookies(res: Response): Record<string, ParsedCookie> {
  const out: Record<string, ParsedCookie> = {}
  for (const line of res.headers.getSetCookie()) {
    const [pair = '', ...rest] = line.split(';').map((part) => part.trim())
    const index = pair.indexOf('=')
    const attrs: Record<string, string | true> = {}
    for (const attr of rest) {
      const eq = attr.indexOf('=')
      if (eq === -1) attrs[attr.toLowerCase()] = true
      else attrs[attr.slice(0, eq).toLowerCase()] = attr.slice(eq + 1)
    }
    out[pair.slice(0, index)] = { value: decodeURIComponent(pair.slice(index + 1)), attrs }
  }
  return out
}

export function isCleared(cookie: ParsedCookie | undefined): boolean {
  return cookie !== undefined && cookie.value === '' && cookie.attrs['max-age'] === '0'
}
