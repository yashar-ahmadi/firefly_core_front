// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildServiceWorker } from '@/features/pwa/sw-source'
import { HOME_COPY, OFFLINE_COPY, shop, SOURCE, VERSION, visitorPage } from './sw-offline-support'
import { navigation, navigationPreloadManager, served, windowAt, worker } from './sw-scope'

// Navigation preload in `/sw.js` (Plan 5 Task 7, carried from Task 6's review): the worker turns
// it on when it takes over, where the browser has it, and every navigation it answers uses the
// browser's preloaded response, so a routed navigation never waits for the worker to start
// before its request leaves. Without a preload (an older browser, a worker just started) the
// worker fetches the page itself, as before. Web push is left as it was.

afterEach(() => {
  vi.useRealTimers()
})

const text = async (response: Response | undefined) => response?.text()

/** A worker that has installed and activated, with `preload` as its registration's. */
async function installed(preload = navigationPreloadManager(), state = { online: true }) {
  const sw = worker(SOURCE, { network: shop(state), navigationPreload: preload })
  await sw.fire('install')
  await sw.fire('activate')
  sw.fetch.mockClear()
  return sw
}

/** A navigation as the browser hands it over with navigation preload on. */
const preloaded = (path: string, response: Promise<Response | undefined>) => ({
  request: navigation(path),
  preloadResponse: response,
})

describe('turning it on', () => {
  it('on activate, where the browser has it; the worker still takes over the pages', async () => {
    const preload = navigationPreloadManager()
    const sw = await installed(preload)
    expect(preload.enable).toHaveBeenCalledTimes(1)
    expect(sw.self.clients.claim).toHaveBeenCalledTimes(1)
  })

  it('a browser without it: activate goes on as before', async () => {
    const sw = worker(SOURCE, { network: shop(), navigationPreload: null })
    await expect(sw.fire('activate')).resolves.toBeUndefined()
    expect(sw.self.clients.claim).toHaveBeenCalledTimes(1)
  })

  it('a browser that refuses it: activate still settles', async () => {
    const preload = navigationPreloadManager()
    preload.enable.mockRejectedValueOnce(new DOMException('No active worker', 'InvalidStateError'))
    const sw = worker(SOURCE, { network: shop(), navigationPreload: preload })
    await expect(sw.fire('activate')).resolves.toBeUndefined()
  })

  it('with FEATURE_PWA off the push-only worker leaves it alone (it answers no navigation)', async () => {
    const preload = navigationPreloadManager()
    const pushOnly = buildServiceWorker({
      inboxPath: '/account/notifications/',
      icon: '/favicon.ico',
      version: VERSION,
      offline: false,
    })
    const sw = worker(pushOnly, { network: shop(), navigationPreload: preload })
    await sw.fire('activate')
    expect(preload.enable).not.toHaveBeenCalled()
  })
})

describe('a navigation the worker answers uses the preloaded response', () => {
  it.each(['/product/x/', '/cart/', '/api/v1/payment/gateway/callback/zarinpal/t/'])(
    '%s (network only): the preload, and no second request',
    async (path) => {
      const sw = await installed()
      const answer = await sw.fire('fetch', preloaded(path, Promise.resolve(served('preloaded'))))
      expect(await text(answer)).toBe('preloaded')
      expect(sw.fetch).not.toHaveBeenCalled()
    },
  )

  it('the home page (network first): the preload, the anonymous copy refreshed behind it', async () => {
    const sw = await installed()
    const before = sw.requests.length
    const answer = await sw.fire('fetch', preloaded('/', Promise.resolve(served('preloaded'))))
    expect(await text(answer)).toBe('preloaded')
    // Only the worker's own copy request (credential-less, `x-ff-offline`) may follow, never the
    // visitor's page a second time.
    const visitorsPage = sw.requests
      .slice(before)
      .filter((request) => !request.headers.has('x-ff-offline'))
    expect(visitorsPage).toEqual([])
  })

  it('no preload for this navigation (undefined): the worker fetches the page itself', async () => {
    const sw = await installed()
    const answer = await sw.fire('fetch', preloaded('/product/x/', Promise.resolve(undefined)))
    expect(await text(answer)).toBe(visitorPage('/product/x/'))
    expect(sw.fetch).toHaveBeenCalledTimes(1)
  })

  it('a preload that fails (offline): the offline page; the home page: its copy', async () => {
    const sw = await installed()
    const failed = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await text(await sw.fire('fetch', preloaded('/product/x/', failed())))).toBe(
      OFFLINE_COPY,
    )
    expect(await text(await sw.fire('fetch', preloaded('/', failed())))).toBe(HOME_COPY)
  })

  it('a preload slower than 4 s on the home page: the copy kept, at 4 s', async () => {
    const sw = await installed()
    vi.useFakeTimers()
    const { answer } = sw.dispatch('fetch', preloaded('/', new Promise<Response>(() => {})))
    let response: Response | undefined
    void answer!.then((value) => (response = value))
    await vi.advanceTimersByTimeAsync(3_999)
    expect(response).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(await text(response)).toBe(HOME_COPY)
  })
})

describe('web push', () => {
  it('a push is shown as before, with navigation preload on', async () => {
    const sw = await installed()
    await sw.fire('push', { data: { json: () => ({ notification: { title: 'سلام' } }) } })
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith(
      'سلام',
      expect.objectContaining({ dir: 'rtl' }),
    )
  })

  it('a click still brings the inbox up', async () => {
    const inbox = windowAt('/account/notifications/')
    const sw = worker(SOURCE, { network: shop(), windows: [inbox] })
    await sw.fire('activate')
    await sw.fire('notificationclick', { notification: { close: vi.fn() } })
    expect(inbox.focus).toHaveBeenCalledTimes(1)
  })
})
