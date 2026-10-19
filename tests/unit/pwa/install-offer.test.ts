// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAY_OFFER_EVENT, MAY_OFFER_FLAG } from '@/features/pwa/install-flag'
import { DISMISSED_KEY, NO_PROMPT_PATH, VISITS_KEY } from '@/features/pwa/install-state'
import { SW_NEVER_CACHED } from '@/features/pwa/offline-rules'
import { scriptPage, type PageOptions } from './script-page'

// Whether this device may be offered the install (Plan 5 Task 6), decided by the registration
// script as the page is parsed (no chunk to download for it): a phone, from the second visit
// (one per tab session), never once dismissed, never in the installed app, never landing on the
// visitor's own pages. Then it raises a flag, and an event for a page already hydrated, which
// the shop layout's gate reads (install-gate.test.tsx).

/** The second visit of a phone: a first tab session, then another. */
function secondVisit(
  options: PageOptions = {},
  arrange: (tab: ReturnType<typeof scriptPage>) => void = () => {},
) {
  const tab = scriptPage(options)
  tab.run()
  tab.newSession()
  arrange(tab)
  tab.run()
  return tab
}

const offered = (tab: ReturnType<typeof scriptPage>) => tab.window[MAY_OFFER_FLAG] === true

describe('the install offer', () => {
  it('a phone, the second visit: offered, the flag and its event', () => {
    const tab = secondVisit()
    expect(tab.local.get(VISITS_KEY)).toBe('2')
    expect(offered(tab)).toBe(true)
    expect(tab.dispatched).toContain(MAY_OFFER_EVENT)
  })

  it('the first visit: not yet', () => {
    const tab = scriptPage()
    tab.run()
    tab.run()
    expect(offered(tab)).toBe(false)
    expect(tab.dispatched).not.toContain(MAY_OFFER_EVENT)
  })

  it.each([
    [
      'dismissed before',
      {},
      (tab: ReturnType<typeof scriptPage>) => tab.local.set(DISMISSED_KEY, '1'),
    ],
    [
      'a count that is no number',
      {},
      (tab: ReturnType<typeof scriptPage>) => tab.local.set(VISITS_KEY, 'x'),
    ],
    ['a wide screen', { phone: false }, () => {}],
    ['the installed app', { standalone: true }, () => {}],
    ['the installed app on an iPhone', { iosStandalone: true }, () => {}],
    ['storage refused', { storage: false }, () => {}],
  ])('%s: never', (_, options, arrange) => {
    expect(offered(secondVisit(options, arrange))).toBe(false)
  })

  it.each([
    '/account/',
    '/account/orders/',
    '/cart/',
    '/checkout/',
    '/payment/callback/',
    '/order/track/',
    '/login/',
    '/register/',
    '/forgot-password/',
  ])('landing on %s: never', (path) => {
    expect(offered(secondVisit({ path }))).toBe(false)
  })

  it('the pages kept from it are every page the service worker never caches', () => {
    for (const rule of SW_NEVER_CACHED) {
      if (!rule.endsWith('/') || ['/api/', '/s/', '/healthz/'].includes(rule)) continue
      expect(NO_PROMPT_PATH.test(rule), rule).toBe(true)
      expect(NO_PROMPT_PATH.test(`${rule}x/`), rule).toBe(true)
    }
    for (const page of ['/', '/product/x/', '/search/', '/blog/', '/orders/', '/carts/']) {
      expect(NO_PROMPT_PATH.test(page), page).toBe(false)
    }
  })
})
