// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubEnv, type FetchSpy } from '../bff/support'

// `/favicon.ico` (src/app/favicon.ico/route.ts): the shop's favicon from its settings, read from
// the API host (never into Next's Data Cache: kept a day in a small in-memory copy of the capped
// bytes), or a bundled neutral icon on any failure, so the browser's own `/favicon.ico` request
// never answers 404.

const settings = vi.hoisted(() => ({ favicon: null as string | null, fail: false }))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => (settings.fail ? null : { favicon: settings.favicon }),
}))

let fetchSpy: FetchSpy

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return import('@/app/favicon.ico/route')
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const png = (body: BodyInit = PNG, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { 'content-type': 'image/png', ...headers } })

beforeEach(() => {
  stubEnv()
  settings.favicon = 'https://api.test/media/categories/26/09/13/site-favicon.png'
  settings.fail = false
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
})

/** The bundled icon: a PNG (its signature), served for a short while only. */
async function expectDefault(res: Response) {
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('image/png')
  expect(res.headers.get('cache-control')).toBe('public, max-age=300')
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  const bytes = new Uint8Array(await res.arrayBuffer())
  expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(bytes.byteLength).toBeGreaterThan(PNG.byteLength)
}

describe('/favicon.ico', () => {
  it('serves the configured favicon with its type, cached a day', async () => {
    fetchSpy.mockResolvedValue(png())
    const { GET } = await load()
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://api.test/media/categories/26/09/13/site-favicon.png')
    // Never Next's Data Cache (it would keep the whole body, whatever its size): our own copy.
    expect(init?.cache).toBe('no-store')
    expect((init as { next?: unknown }).next).toBeUndefined()
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.redirect).toBe('manual')
  })

  it('keeps the file a day in memory: asked once, then served from the copy', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-17T10:00:00Z'), toFake: ['Date'] })
    try {
      fetchSpy.mockImplementation(async () => png())
      const { GET } = await load()
      await GET()
      const again = await GET()
      expect(new Uint8Array(await again.arrayBuffer())).toEqual(PNG)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date('2026-10-18T10:00:01Z'))
      await GET()
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a failure is tried again after five minutes, not a day', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-17T10:00:00Z'), toFake: ['Date'] })
    try {
      fetchSpy.mockImplementation(async () => new Response('Not found', { status: 404 }))
      const { GET } = await load()
      await expectDefault(await GET())
      await GET()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date('2026-10-17T10:05:01Z'))
      await GET()
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a few files at most (a new favicon is a new URL): memory stays bounded', async () => {
    fetchSpy.mockImplementation(async () => png())
    const { GET } = await load()
    for (let n = 1; n <= 5; n += 1) {
      settings.favicon = `https://api.test/media/icons/${n}.png`
      await GET()
    }
    expect(fetchSpy).toHaveBeenCalledTimes(5)
    // The oldest went to make room; the newest is still kept.
    settings.favicon = 'https://api.test/media/icons/1.png'
    await GET()
    settings.favicon = 'https://api.test/media/icons/5.png'
    await GET()
    expect(fetchSpy).toHaveBeenCalledTimes(6)
  })

  it('reads the file from the API host it was configured on, whatever host the URL names', async () => {
    settings.favicon = 'http://backend:8000/media/x/icon.png?v=2'
    fetchSpy.mockResolvedValue(png())
    const { GET } = await load()
    await GET()
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('https://api.test/media/x/icon.png?v=2')
  })

  it.each([
    ['no settings', () => void (settings.fail = true)],
    ['no favicon', () => void (settings.favicon = null)],
    ['a path outside /media/ and /static/', () => void (settings.favicon = '/admin/x.png')],
    ['a URL that is no URL', () => void (settings.favicon = 'http://[bad')],
  ])('serves the bundled icon for %s, asking nobody', async (_label, arrange) => {
    arrange()
    const { GET } = await load()
    await expectDefault(await GET())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a 404', async () => new Response('Not found', { status: 404 })],
    [
      'an HTML page',
      async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
    ],
    [
      'an SVG (script on our origin)',
      async () => png('<svg/>', { 'content-type': 'image/svg+xml' }),
    ],
    [
      'a declared size over 100 KB',
      async () => png(PNG, { 'content-length': String(100 * 1024 + 1) }),
    ],
    ['a body over 100 KB', async () => png(new Uint8Array(100 * 1024 + 1))],
    [
      'a timeout',
      async (): Promise<Response> => Promise.reject(new DOMException('t', 'TimeoutError')),
    ],
    ['no connection', async (): Promise<Response> => Promise.reject(new TypeError('fetch failed'))],
  ])('serves the bundled icon for %s', async (_label, answer) => {
    fetchSpy.mockImplementation(answer)
    const { GET } = await load()
    await expectDefault(await GET())
  })
})
