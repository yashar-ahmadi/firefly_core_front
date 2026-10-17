// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubEnv, type FetchSpy } from '../bff/support'

// `/favicon.ico` (src/app/favicon.ico/route.ts): the shop's favicon from its settings, read from
// the API host with a day's revalidate, or a bundled neutral icon on any failure, so the browser's
// own `/favicon.ico` request never answers 404.

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
    const next = (init as { next?: { revalidate?: number; tags?: string[] } }).next
    expect(next).toEqual({ revalidate: 86_400, tags: ['settings'] })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.redirect).toBe('manual')
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
