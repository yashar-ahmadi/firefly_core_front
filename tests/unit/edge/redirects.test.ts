// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envelope, failure, stubEnv, type FetchSpy } from '../bff/support'

let fetchSpy: FetchSpy

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return import('@/lib/edge/redirects')
}

function listPage(sources: string[], next: string | null) {
  return envelope({
    count: sources.length,
    next,
    results: sources.map((source_path) => ({
      source_path,
      target: '/x/',
      redirect_type: 'permanent',
      status_code: 301,
    })),
  })
}

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('ruleSpelling', () => {
  it.each([
    ['/product//old/', '/product/old'],
    ['/blog/%DA%A9/', '/blog/\u{06A9}'],
    ['/', '/'],
    ['//', '/'],
    ['/festival', '/festival'],
    ['//product//old-name', '/product/old-name'],
    ['/Product/Old-Name/', '/Product/Old-Name'],
    // As the backend's `unquote` (UTF-8, errors="replace") and re-escaped `%`: a legacy path in
    // another encoding is stored with U+FFFD for each bad sequence, a stray `%` as `%25`.
    ['/old/%C7%E1/', '/old/\u{FFFD}\u{FFFD}'],
    ['/old/%C7a%E1', '/old/\u{FFFD}a\u{FFFD}'],
    ['/blog/%DA%A9%E0%A4/', '/blog/\u{06A9}\u{FFFD}'],
    ['/blog/%DA%A9%E0%A4%A/', '/blog/\u{06A9}\u{FFFD}%25A'],
    ['/x/%ED%A0%80', '/x/\u{FFFD}\u{FFFD}\u{FFFD}'],
    ['/page/abc%ZZ/', '/page/abc%25ZZ'],
    ['/page/100%', '/page/100%25'],
  ])('spells %s as %s', async (input, expected) => {
    const { ruleSpelling } = await load()
    expect(ruleSpelling(input)).toBe(expected)
  })

  it.each(['/a%2Fb', '/a%2fb', '/a%3Fb', '/a%23b', '/a%25b', '/a%ZZ%2Fb', '/a%20b', '/a%0Ab'])(
    'has no local spelling for %s',
    async (input) => {
      const { ruleSpelling } = await load()
      expect(ruleSpelling(input)).toBeNull()
    },
  )
})

describe('knownSources', () => {
  it('reads every page of the rule list with the API key', async () => {
    fetchSpy
      .mockResolvedValueOnce(listPage(['/festival'], 'http://api/next'))
      .mockResolvedValueOnce(listPage(['/product/nokia-3310-classic'], null))
    const { knownSources } = await load()
    const sources = await knownSources()
    expect([...sources]).toEqual(['/festival', '/product/nokia-3310-classic'])
    const urls = fetchSpy.mock.calls.map(([url]) => String(url))
    expect(urls).toEqual([
      'https://api.test/api/v1/redirects/list/?limit=100&page=1',
      'https://api.test/api/v1/redirects/list/?limit=100&page=2',
    ])
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('X-API-Key')).toBe('key-123')
    expect(init.redirect).toBe('manual')
  })

  it('keeps the set for five minutes, then serves it stale while one refresh runs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    fetchSpy.mockResolvedValueOnce(listPage(['/old'], null))
    const { knownSources } = await load()
    expect((await knownSources()).has('/old')).toBe(true)

    vi.setSystemTime(Date.now() + 4 * 60 * 1000)
    await knownSources()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 2 * 60 * 1000)
    let release: (res: Response) => void = () => undefined
    fetchSpy.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)))
    const stale = await knownSources()
    expect(stale.has('/old')).toBe(true)
    await knownSources()
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    release(listPage(['/new'], null))
    await vi.waitFor(async () => expect((await knownSources()).has('/new')).toBe(true))
  })

  it('answers an empty set when the first load fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'))
    const { knownSources } = await load()
    expect((await knownSources()).size).toBe(0)
  })

  it('retries a failed load after 30 seconds, not five minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // The storefront booted before the backend: the first load fails.
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'))
    const { knownSources } = await load()
    expect((await knownSources()).size).toBe(0)

    vi.setSystemTime(Date.now() + 20 * 1000)
    await knownSources()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 11 * 1000)
    fetchSpy.mockResolvedValueOnce(listPage(['/festival'], null))
    await vi.waitFor(async () => expect((await knownSources()).has('/festival')).toBe(true))
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // A successful load is kept for the full five minutes again.
    vi.setSystemTime(Date.now() + 4 * 60 * 1000)
    await knownSources()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('keeps serving the last good list while a failed refresh waits 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchSpy.mockResolvedValueOnce(listPage(['/old'], null))
    const { knownSources } = await load()
    expect((await knownSources()).has('/old')).toBe(true)

    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await knownSources()).has('/old')).toBe(true)
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled())

    vi.setSystemTime(Date.now() + 31 * 1000)
    fetchSpy.mockResolvedValueOnce(listPage(['/new'], null))
    await vi.waitFor(async () => expect((await knownSources()).has('/new')).toBe(true))
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })
})

describe('resolveRedirect', () => {
  it('asks the API with the encoded path and query and returns the rule', async () => {
    fetchSpy.mockResolvedValueOnce(
      envelope({
        source_path: '/product/samsung-galaxy-s23-ultra',
        target: '/product/samsung-galaxy-s25-ultra/?utm_source=sms&a=1',
        redirect_type: 'permanent',
        status_code: 301,
      }),
    )
    const { resolveRedirect } = await load()
    await expect(
      resolveRedirect('/product/samsung-galaxy-s23-ultra/?utm_source=sms&a=1', '203.0.113.9'),
    ).resolves.toEqual({
      status: 301,
      target: '/product/samsung-galaxy-s25-ultra/?utm_source=sms&a=1',
    })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://api.test/api/v1/redirects/resolve/?path=%2Fproduct%2Fsamsung-galaxy-s23-ultra%2F%3Futm_source%3Dsms%26a%3D1',
    )
    expect(init.cache).toBe('no-store')
    expect(init.redirect).toBe('manual')
    expect(new Headers(init.headers).get('X-API-Key')).toBe('key-123')
    expect(new Headers(init.headers).get('X-Forwarded-For')).toBe('203.0.113.9')
  })

  it('returns a gone rule with an empty target', async () => {
    fetchSpy.mockResolvedValueOnce(
      envelope({ source_path: '/g', target: '', redirect_type: 'gone', status_code: 410 }),
    )
    const { resolveRedirect } = await load()
    await expect(resolveRedirect('/g/')).resolves.toEqual({ status: 410, target: '' })
  })

  it.each([
    ['no rule', () => failure(404, 'redirect_not_found')],
    ['a bad path', () => failure(400, 'max_length')],
    ['a server error', () => new Response('oops', { status: 500 })],
    [
      'an unknown status',
      () => envelope({ source_path: '/a', target: '/b/', redirect_type: 'x', status_code: 307 }),
    ],
    [
      'a redirect without a target',
      () =>
        envelope({ source_path: '/a', target: '', redirect_type: 'temporary', status_code: 302 }),
    ],
  ])('returns null for %s', async (_label, answer) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchSpy.mockResolvedValueOnce(answer())
    const { resolveRedirect } = await load()
    await expect(resolveRedirect('/a/')).resolves.toBeNull()
  })

  it('returns null when the API is unreachable', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'))
    const { resolveRedirect } = await load()
    await expect(resolveRedirect('/a/')).resolves.toBeNull()
  })
})
