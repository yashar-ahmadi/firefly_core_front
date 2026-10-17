// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  bff,
  envelope,
  failure,
  isCleared,
  loadHandler,
  refreshCalls,
  setCookies,
  stubEnv,
  upstreamCalls,
  type FetchSpy,
} from './support'

// The access cookie has expired (or the API rejects it) and the refresh fails for a reason that
// says nothing about the session (5xx, 429, no answer) while the refresh cookie is there: the
// session lives. A call without a bearer would answer 401 (or as a guest) and the page would end
// a live session, so the BFF answers a retryable 503 instead, cookies untouched. A refresh token
// the API rejects still ends the session (cookies cleared, the call as a guest).

let fetchSpy: FetchSpy

function route(refresh: () => Response | Promise<Response>, upstream: () => Response) {
  fetchSpy.mockImplementation(async (input) =>
    String(input).endsWith('account/auth/token/refresh/') ? refresh() : upstream(),
  )
}

const SESSION = ['ff_at', 'ff_rt', 'ff_auth']
/** The access cookie is gone (its max-age is the token's life): only the refresh cookie is left. */
const EXPIRED = { ff_rt: jwtExpiringIn(9999), ff_auth: '1' }

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ ok: true }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

async function errorCode(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { data?: { errors?: Array<{ code?: string }> } }
  return body.data?.errors?.[0]?.code
}

describe('a transient refresh failure with the access cookie gone', () => {
  it.each([
    ['a 5xx', () => failure(503, 'service_unavailable')],
    ['no answer', () => Promise.reject(new TypeError('fetch failed'))],
  ])('%s: a retryable 503, no call without a bearer, cookies kept', async (_, answer) => {
    route(answer, () => failure(401, 'not_authenticated'))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('account/profile/me/', { cookies: EXPIRED }))
    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('session_refresh_unavailable')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(upstreamCalls(fetchSpy)).toHaveLength(0)
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('a 429: the 503 says when to try again (Retry-After)', async () => {
    route(
      () =>
        envelope(
          { type: 'client_error', errors: [{ code: 'throttled', detail: 'd', attr: null }] },
          429,
          { 'retry-after': '30' },
        ),
      () => envelope({}),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('cart/', { cookies: EXPIRED }))
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(upstreamCalls(fetchSpy)).toHaveLength(0)
  })

  it('a refresh token the API rejects still ends the session: cookies cleared, a guest call', async () => {
    route(
      () => failure(401, 'token_not_valid'),
      () => failure(401, 'not_authenticated'),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('account/profile/me/', { cookies: EXPIRED }))
    expect(res.status).toBe(401)
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.headers.has('Authorization')).toBe(false)
    const cookies = setCookies(res)
    for (const name of SESSION) expect(isCleared(cookies[name]), name).toBe(true)
  })

  it('an access token still valid for a moment is still sent (it may well do)', async () => {
    route(
      () => failure(502, 'bad_gateway'),
      () => envelope({ uuid: 'u' }),
    )
    const handleBff = await loadHandler()
    const access = jwtExpiringIn(5)
    const res = await handleBff(
      ...bff('account/profile/me/', { cookies: { ...EXPIRED, ff_at: access } }),
    )
    expect(res.status).toBe(200)
    expect(upstreamCalls(fetchSpy)[0]?.headers.get('Authorization')).toBe(`Bearer ${access}`)
  })
})

describe('a 401 token_not_valid, then a refresh that cannot be had now', () => {
  it('a 503 instead of the 401 (which would end a live session), cookies kept', async () => {
    route(
      () => failure(503, 'service_unavailable'),
      () => failure(401, 'token_not_valid'),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('dashboard/summary/', { cookies: { ...EXPIRED, ff_at: jwtExpiringIn(600) } }),
    )
    expect(res.status).toBe(503)
    expect(refreshCalls(fetchSpy)).toHaveLength(1)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
    expect(res.headers.getSetCookie()).toEqual([])
  })
})

describe('a streamed upload after a 401 token_not_valid (it cannot be replayed)', () => {
  function upload() {
    const form = new FormData()
    form.append('avatar_picture', new Blob(['x']), 'a.jpg')
    return bff('account/profile/me/', {
      method: 'PATCH',
      body: form,
      cookies: { ...EXPIRED, ff_at: jwtExpiringIn(600) },
    })
  }

  it('refreshed: a retryable 503 with the new access cookie, never a 401', async () => {
    const fresh = jwtExpiringIn(900)
    route(
      () => envelope({ access: fresh }),
      () => failure(401, 'token_not_valid'),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(...upload())
    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('upload_retry')
    expect(setCookies(res).ff_at?.value).toBe(fresh)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
  })

  it('the refresh token rejected: the 401, and the session ends', async () => {
    route(
      () => failure(401, 'token_not_valid'),
      () => failure(401, 'token_not_valid'),
    )
    const handleBff = await loadHandler()
    const res = await handleBff(...upload())
    expect(res.status).toBe(401)
    expect(isCleared(setCookies(res).ff_rt)).toBe(true)
  })
})
