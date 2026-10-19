// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PURGE_PAGES_MESSAGE } from '@/features/pwa/purge-offline-pages'
import { buildServiceWorker } from '@/features/pwa/sw-source'
import { offlineCacheNames } from '@/features/pwa/sw-offline'
import {
  CACHES,
  HOME_COPY,
  OFFLINE_COPY,
  shop,
  SOURCE,
  VERSION,
  visitorPage,
} from './sw-offline-support'
import { navigation, served, worker } from './sw-scope'

// `/sw.js`'s offline caching over its life (Plan 5 Task 6): what it keeps when it installs (the
// offline page and the home page, each as the anonymous copy the server allows, and the files
// their HTML names), the caches of an earlier build deleted when it takes over, and the logout's
// purge. With FEATURE_PWA off the worker only cleans up after an earlier one.

const pages = async (sw: ReturnType<typeof worker>) => (await sw.caches.open(CACHES.pages)).paths()

describe('install', () => {
  it('keeps the offline page and the home page as anonymous copies, asked for without cookies', async () => {
    const sw = worker(SOURCE, { network: shop() })
    await sw.fire('install')
    expect(await pages(sw)).toEqual(['/offline/', '/'])
    const asked = sw.requests.filter((request) => request.headers.has('x-ff-offline'))
    expect(asked.map((request) => new URL(request.url).pathname)).toEqual(['/offline/', '/'])
    for (const request of asked) {
      expect(request.credentials).toBe('omit')
      expect(request.cache).toBe('no-store')
      expect(request.headers.get('x-ff-offline')).toBe('snapshot')
    }
    const cache = await sw.caches.open(CACHES.pages)
    expect(await (await cache.match('/'))?.text()).toBe(HOME_COPY)
    expect(await (await cache.match('/offline/'))?.text()).toBe(OFFLINE_COPY)
  })

  it('keeps the app’s files those pages name (styles, scripts, the font), for them to work offline', async () => {
    const sw = worker(SOURCE, { network: shop() })
    await sw.fire('install')
    expect((await sw.caches.open(CACHES.static)).paths().sort()).toEqual([
      '/_next/static/chunks/app.css',
      '/_next/static/chunks/lazy.js',
      '/_next/static/chunks/main.js',
      '/_next/static/media/vazirmatn.woff2',
    ])
  })

  it.each([
    [
      'the server’s usual private, no-store',
      { copyHeaders: { 'cache-control': 'private, no-store' } },
    ],
    ['no consent header back', { copyHeaders: { 'cache-control': 'no-cache' } }],
    [
      'consent but private',
      { copyHeaders: { 'cache-control': 'private, no-cache', 'x-ff-offline': 'snapshot' } },
    ],
    ['an error page', { copyStatus: 500 }],
  ])('keeps no copy the server does not allow: %s', async (_, options) => {
    const sw = worker(SOURCE, { network: shop({ online: true }, options) })
    await sw.fire('install')
    expect(await pages(sw)).toEqual([])
  })

  it('never fails when the cache refuses a page (storage full): the worker installs', async () => {
    const sw = worker(SOURCE, { network: shop() })
    const pagesCache = await sw.caches.open(CACHES.pages)
    pagesCache.put = async () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
    await expect(sw.fire('install')).resolves.toBeUndefined()
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('never fails without a network: the worker installs (web push needs it all the same)', async () => {
    const sw = worker(SOURCE, { network: shop({ online: false }) })
    await expect(sw.fire('install')).resolves.toBeUndefined()
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1)
    expect(await pages(sw)).toEqual([])
  })
})

describe('activate', () => {
  it('names its caches after the build; deletes every cache of an earlier build, nothing else', async () => {
    expect(Object.values(CACHES)).toEqual([
      `ff-${VERSION}-static`,
      `ff-${VERSION}-images`,
      `ff-${VERSION}-pages`,
    ])
    const sw = worker(SOURCE, { network: shop() })
    for (const name of [...Object.values(offlineCacheNames('build-6')), 'other-library']) {
      await sw.caches.open(name)
    }
    await sw.fire('install')
    await sw.fire('activate')
    const names = await sw.caches.keys()
    expect(names.filter((name) => name.includes('build-6'))).toEqual([])
    expect(names.sort()).toEqual([CACHES.static, CACHES.pages, 'other-library'].sort())
    expect(sw.self.clients.claim).toHaveBeenCalledTimes(1)
  })
})

describe('the logout’s purge', () => {
  it('forgets every page kept, then keeps the anonymous copies again', async () => {
    const sw = worker(SOURCE, { network: shop() })
    await sw.fire('install')
    const cache = await sw.caches.open(CACHES.pages)
    await cache.put('/', served(visitorPage('/')))
    await sw.fire('message', { data: { type: PURGE_PAGES_MESSAGE } })
    const kept = await sw.caches.open(CACHES.pages)
    expect(kept).not.toBe(cache)
    expect(await (await kept.match('/'))?.text()).toBe(HOME_COPY)
    expect(await (await kept.match('/offline/'))?.text()).toBe(OFFLINE_COPY)
  })

  it('ignores any other message', async () => {
    const sw = worker(SOURCE, { network: shop() })
    await sw.fire('install')
    await sw.fire('message', { data: { type: 'something-else' } })
    await sw.fire('message', { data: null })
    expect(await pages(sw)).toEqual(['/offline/', '/'])
  })
})

describe('with FEATURE_PWA off', () => {
  const PUSH_ONLY = buildServiceWorker({
    inboxPath: '/account/notifications/',
    icon: '/favicon.ico',
    version: VERSION,
    offline: false,
  })

  it('keeps nothing, answers no request, and deletes the caches an earlier worker left', async () => {
    const sw = worker(PUSH_ONLY, { network: shop() })
    for (const name of [...Object.values(CACHES), 'other-library']) await sw.caches.open(name)
    await sw.fire('install')
    await sw.fire('activate')
    expect(await sw.caches.keys()).toEqual(['other-library'])
    expect(await sw.request(navigation('/'))).toBeUndefined()
    expect(sw.fetch).not.toHaveBeenCalled()
  })
})
