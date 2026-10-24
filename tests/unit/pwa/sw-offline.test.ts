// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CACHES, HOME_COPY, OFFLINE_COPY, shop, SOURCE, visitorPage } from './sw-offline-support'
import { navigation, served, subresource, worker } from './sw-scope'

// The offline caching section of `/sw.js` (Plan 5 Task 6), run in the stand-in worker scope:
// which requests it answers and how (cache first, stale while revalidate, network first), and
// that it never keeps nor serves from a cache what is never to be cached.

afterEach(() => {
  vi.useRealTimers()
})

/** A worker that has installed (the offline page and the home page's anonymous copy kept). */
async function installed(state = { online: true }) {
  const sw = worker(SOURCE, { network: shop(state) })
  await sw.fire('install')
  await sw.fire('activate')
  sw.fetch.mockClear()
  return sw
}

const text = async (response: Response | undefined) => response?.text()

describe('what the worker leaves alone', () => {
  it.each([
    ['a POST', subresource('/api/bff/cart/', '', { method: 'POST', body: '{}' })],
    ['a navigation POST (a bank’s return)', navigation('/payment/callback/', { method: 'POST' })],
    [
      'a request with Authorization',
      subresource('/_next/static/chunks/a.js', 'script', {
        headers: { authorization: 'Bearer x' },
      }),
    ],
    ['the BFF', subresource('/api/bff/global/settings/')],
    ['the worker itself', subresource('/sw.js', 'script')],
    ['the manifest', subresource('/manifest.webmanifest', 'manifest')],
    ['the health check', subresource('/healthz/')],
    ['a router fetch of a page (RSC)', subresource('/product/x/?_rsc=1a2b')],
    ['an image on the API host', subresource('http://api.shop.test/media/a.jpg', 'image')],
    ['a file under /media/ that is no image', subresource('/media/manual.pdf', 'document')],
  ])('%s: not answered (the browser’s own request)', async (_, request) => {
    const sw = await installed()
    expect(await sw.request(request)).toBeUndefined()
    expect(sw.fetch).not.toHaveBeenCalled()
  })
})

// A page never cached, or whose address holds a credential: sw-offline-sealed.test.ts.

describe('a navigation to any other page', () => {
  it('the network’s page, never kept; offline the offline page', async () => {
    const state = { online: true }
    const sw = await installed(state)
    expect(await text(await sw.request(navigation('/product/x/')))).toBe(visitorPage('/product/x/'))
    expect((await sw.caches.open(CACHES.pages)).paths()).toEqual(['/offline/', '/'])
    state.online = false
    expect(await text(await sw.request(navigation('/product/x/')))).toBe(OFFLINE_COPY)
  })

  it('without the offline page kept, a built-in one says the same', async () => {
    const sw = worker(SOURCE)
    await sw.fire('activate')
    const response = await sw.request(navigation('/blog/'))
    expect(response?.status).toBe(503)
    expect(await text(response)).toContain('اتصال اینترنت برقرار نیست')
  })
})

describe('a navigation to the home page (network first)', () => {
  it('online: the visitor’s own page, which is never kept: the copy kept is the anonymous one', async () => {
    const sw = await installed()
    expect(await text(await sw.request(navigation('/')))).toBe(visitorPage('/'))
    expect(await text(await (await sw.caches.open(CACHES.pages)).match('/'))).toBe(HOME_COPY)
  })

  it('offline: the copy kept, the query ignored (the installed app opens /?source=pwa)', async () => {
    const state = { online: true }
    const sw = await installed(state)
    state.online = false
    expect(await text(await sw.request(navigation('/')))).toBe(HOME_COPY)
    expect(await text(await sw.request(navigation('/?source=pwa')))).toBe(HOME_COPY)
  })

  it('a copy that varies on X-FF-Offline (the consent) is served all the same, by path', async () => {
    const state = { online: true }
    const sw = await installed(state)
    const copy = await (await sw.caches.open(CACHES.pages)).match('/', { ignoreVary: true })
    expect(copy?.headers.get('vary')).toContain('X-FF-Offline')
    state.online = false
    expect(await text(await sw.request(navigation('/')))).toBe(HOME_COPY)
    expect(await text(await sw.request(navigation('/product/x/')))).toBe(OFFLINE_COPY)
  })

  it('offline with no copy kept: the offline page', async () => {
    const state = { online: true }
    const sw = await installed(state)
    await (await sw.caches.open(CACHES.pages)).delete('/')
    state.online = false
    expect(await text(await sw.request(navigation('/')))).toBe(OFFLINE_COPY)
  })

  it('a network slower than 4 s: the copy kept, at 4 s', async () => {
    const sw = await installed()
    vi.useFakeTimers()
    sw.fetch.mockImplementationOnce(() => new Promise<Response>(() => {}))
    const { answer } = sw.dispatch('fetch', { request: navigation('/') })
    let response: Response | undefined
    void answer!.then((value) => (response = value))
    await vi.advanceTimersByTimeAsync(3_999)
    expect(response).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(await text(response)).toBe(HOME_COPY)
  })

  it('a slow network and no copy: the page when it comes, not the offline page at 4 s', async () => {
    const sw = await installed()
    await (await sw.caches.open(CACHES.pages)).delete('/')
    vi.useFakeTimers()
    let arrive: (response: Response) => void = () => {}
    sw.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => (arrive = resolve)))
    const { answer } = sw.dispatch('fetch', { request: navigation('/') })
    let response: Response | undefined
    void answer!.then((value) => (response = value))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(response).toBeUndefined()
    arrive(served('late page'))
    await vi.advanceTimersByTimeAsync(0)
    expect(await text(response)).toBe('late page')
  })
})

describe('the app’s own files (/_next/static, cache first)', () => {
  const asset = () => subresource('/_next/static/chunks/page-1.js', 'script')

  it('kept on the first load, then served from the cache, offline too', async () => {
    const state = { online: true }
    const sw = await installed(state)
    expect(await text(await sw.request(asset()))).toBe('/* /_next/static/chunks/page-1.js */')
    expect(sw.fetch).toHaveBeenCalledTimes(1)
    state.online = false
    expect(await text(await sw.request(asset()))).toBe('/* /_next/static/chunks/page-1.js */')
    expect(sw.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no-store', { headers: { 'cache-control': 'no-store' } }],
    ['private', { headers: { 'cache-control': 'private, max-age=60' } }],
    ['not a 200', { status: 404 }],
    ['not basic or cors (opaque)', { type: 'opaque' as ResponseType }],
  ])('a response that is %s is passed on, never kept', async (_, answer) => {
    const sw = await installed()
    sw.fetch.mockResolvedValueOnce(served('x', answer))
    await sw.request(asset())
    expect((await sw.caches.open(CACHES.static)).paths()).not.toContain(
      '/_next/static/chunks/page-1.js',
    )
  })
})
