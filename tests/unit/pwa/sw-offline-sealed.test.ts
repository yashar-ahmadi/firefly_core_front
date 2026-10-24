// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { OFFLINE_FALLBACK_HTML, OFFLINE_MESSAGE, OFFLINE_RETRY } from '@/features/pwa/offline-text'
import { CACHES, HOME_COPY, OFFLINE_COPY, shop, SOURCE, visitorPage } from './sw-offline-support'
import { navigation, ORIGIN, served, worker } from './sw-scope'

// The navigations the worker never answers with a page it kept (Plan 5 final fix wave): a page
// never cached (SW_NEVER_CACHED), a page whose address holds a credential (a payment link's token,
// a payment's uuid: src/config/credential-routes.ts), and any address whose `next` leads back to
// one. A kept copy is a page of the shop's, scripts and all, and it would run at that address: so
// offline these get the page built into the worker instead, which runs no script, loads nothing
// and sends no referrer.

/** A worker that has installed (the offline page and the home page's anonymous copy kept). */
async function installed(state = { online: true }) {
  const sw = worker(SOURCE, { network: shop(state) })
  await sw.fire('install')
  await sw.fire('activate')
  sw.fetch.mockClear()
  return sw
}

const UUID = '3f1c7a52-9a0e-4c4b-b5e0-0d2f3b1c9a77'

describe('a navigation to a page never cached, or whose address holds a credential', () => {
  it.each([
    '/cart/',
    '/account/orders/',
    '/checkout/',
    '/checkout/thanks/5550001234/',
    `/payment/callback/?payment=${UUID}`,
    `/payment/card-transfer/${UUID}/`,
    '/order/pay/token-1/',
    '/Order/Pay/token-1/',
    '/order/track/',
    '/login/?next=/account/',
    '/login/?next=/order/pay/token-1/',
    '/s/abc/',
    '/api/v1/payment/gateway/callback/zarinpal/t/',
    // A `next` that leads back to a payment page: on the page that has a copy, and on one without.
    '/?next=/order/pay/token-1/',
    `/blog/?next=${encodeURIComponent(`/payment/callback/?payment=${UUID}`)}`,
  ])('%s: the network’s page, kept nowhere; offline the worker’s own page', async (path) => {
    const state = { online: true }
    const sw = await installed(state)
    const { pathname } = new URL(path, ORIGIN)
    expect(await (await sw.request(navigation(path)))?.text()).toBe(visitorPage(pathname))
    const pages = await sw.caches.open(CACHES.pages)
    expect(pages.paths()).toEqual(['/offline/', '/'])
    expect(await (await pages.match('/'))?.text()).toBe(HOME_COPY)
    expect((await sw.caches.open(CACHES.images)).paths()).not.toContain(pathname)
    // Even a copy someone left at that path is never served, nor the kept offline page.
    await pages.put(pathname, served('stale copy'))
    state.online = false
    const offline = await sw.request(navigation(path))
    expect(offline?.status).toBe(503)
    expect(offline?.headers.get('referrer-policy')).toBe('no-referrer')
    expect(await offline?.text()).toBe(OFFLINE_FALLBACK_HTML)
  })

  it.each(['/Cart/', '/%61ccount/'])(
    'another spelling (%s): never a copy of its own either (the kept pages are an allow-list)',
    async (path) => {
      const state = { online: true }
      const sw = await installed(state)
      await (await sw.caches.open(CACHES.pages)).put(path, served('stale copy'))
      state.online = false
      expect(await (await sw.request(navigation(path)))?.text()).toBe(OFFLINE_COPY)
    },
  )

  it('any other page that fails: the offline page kept', async () => {
    const state = { online: true }
    const sw = await installed(state)
    state.online = false
    expect(await (await sw.request(navigation('/blog/?next=/account/')))?.text()).toBe(OFFLINE_COPY)
  })
})

describe('the page built into the worker', () => {
  it('runs no script and loads nothing: no script, style sheet, picture, frame or handler', () => {
    expect(OFFLINE_FALLBACK_HTML).not.toMatch(
      /<script|<link|<img|<iframe|<object|<embed|<video|<audio|<style|\ssrc=|srcset=|url\(|@import|\son[a-z]+=/i,
    )
    // Its one link is the address itself: «تلاش دوباره» asks for it again.
    expect([...OFFLINE_FALLBACK_HTML.matchAll(/href="([^"]*)"/g)].map(([, href]) => href)).toEqual([
      '',
    ])
  })

  it('says the connection is down, in Persian, right to left, noindex', () => {
    expect(OFFLINE_FALLBACK_HTML).toMatch(/^<!doctype html><html lang="fa" dir="rtl">/)
    expect(OFFLINE_FALLBACK_HTML).toContain('<h1')
    expect(OFFLINE_FALLBACK_HTML).toContain(OFFLINE_MESSAGE)
    expect(OFFLINE_FALLBACK_HTML).toContain(`>${OFFLINE_RETRY}</a>`)
    expect(OFFLINE_FALLBACK_HTML).toContain('<meta name="robots" content="noindex">')
  })
})
