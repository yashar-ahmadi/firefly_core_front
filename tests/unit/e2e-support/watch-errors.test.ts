import { describe, expect, it } from 'vitest'
import { forgiveFailure, isExpectedFailure, watchErrors } from '../../e2e/support/watch-errors'

// The e2e console guard (tests/e2e/support/watch-errors.ts): only the dev backend's missing
// pictures and routes later plans build may fail; anything else must reach the test.

const NOT_FOUND = 'Failed to load resource: the server responded with a status of 404 (Not Found)'
const SERVER_ERROR =
  'Failed to load resource: the server responded with a status of 500 (Internal Server Error)'

describe('isExpectedFailure', () => {
  it('lets through the backend pictures under /media/ and /static/ that are missing (404)', () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:8000/media/CACHE/a.jpg')).toBe(true)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/static/defaults/default.png')).toBe(
      true,
    )
  })

  it('and the same pictures through the image optimizer (`/_next/image/?url=/media/…`)', () => {
    const optimized = (url: string) =>
      `http://localhost:3000/_next/image/?url=${encodeURIComponent(url)}&w=32&q=75`
    expect(isExpectedFailure(NOT_FOUND, optimized('/media/CACHE/images/brands/a.png'))).toBe(true)
    // Anything else it serves is still reported.
    expect(isExpectedFailure(NOT_FOUND, optimized('/_next/static/media/a.png'))).toBe(false)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/_next/image/?w=32')).toBe(false)
    expect(isExpectedFailure(SERVER_ERROR, optimized('/media/a.png'))).toBe(false)
  })

  it('reports a backend picture that fails any other way (a 5xx, a refused connection)', () => {
    expect(isExpectedFailure(SERVER_ERROR, 'http://localhost:8000/media/CACHE/a.jpg')).toBe(false)
    expect(
      isExpectedFailure(
        'Failed to load resource: the server responded with a status of 502 (Bad Gateway)',
        'http://localhost:3000/static/defaults/default.png',
      ),
    ).toBe(false)
    expect(
      isExpectedFailure(
        'Failed to load resource: net::ERR_CONNECTION_REFUSED',
        'http://localhost:8000/media/a.jpg',
      ),
    ).toBe(false)
  })

  it("reports a failed Next chunk under /_next/static/ (the path only contains '/static/')", () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/_next/static/chunks/app.js')).toBe(
      false,
    )
    expect(isExpectedFailure(SERVER_ERROR, 'http://localhost:3000/_next/static/css/app.css')).toBe(
      false,
    )
  })

  it('lets through only 404s from the routes not built yet', () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/page/terms/?_rsc=abc')).toBe(true)
    expect(isExpectedFailure(SERVER_ERROR, 'http://localhost:3000/page/terms/?_rsc=abc')).toBe(
      false,
    )
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/product/x/')).toBe(false)
    // The card transfer's page exists now (Task 6): a 404 there is reported.
    expect(
      isExpectedFailure(NOT_FOUND, 'http://localhost:3000/payment/card-transfer/0b6f5a9e/'),
    ).toBe(false)
    // The payment link's page itself exists now: a 404 there is reported.
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/order/pay/x/')).toBe(false)
  })

  it('reports a 404 from the cart and checkout pages, which exist now (Plan 4 Tasks 1–2)', () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/cart/?_rsc=abc')).toBe(false)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/cart/')).toBe(false)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/checkout/?_rsc=abc')).toBe(false)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/checkout/')).toBe(false)
  })

  it('reports a 404 from the blog home and its category pages (Plan 5 Task 1)', () => {
    for (const path of [
      '/blog/',
      '/blog/?page=2',
      '/blog/?_rsc=abc',
      '/blog/category/tech-news/',
      '/blog/category/tech-news/mobile-blog/?_rsc=abc',
      '/blog/category/no-such/',
    ]) {
      expect(isExpectedFailure(NOT_FOUND, `http://localhost:3000${path}`), path).toBe(false)
    }
  })

  it('still lets through a post page’s 404 until its route lands (Task 2), and only a 404', () => {
    const post = 'http://localhost:3000/blog/best-phones-under-30m/?_rsc=abc'
    expect(isExpectedFailure(NOT_FOUND, post)).toBe(true)
    expect(
      isExpectedFailure(NOT_FOUND, 'http://localhost:3000/blog/%DA%AF%D9%88%D8%B4%DB%8C/'),
    ).toBe(true)
    expect(isExpectedFailure(SERVER_ERROR, post)).toBe(false)
    // Deeper paths under /blog/ are no post: a 404 there is reported.
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/blog/a/b/')).toBe(false)
  })

  it('reports a 404 from the search page, which exists now', () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/search/?_rsc=abc')).toBe(false)
  })

  it('reports a 404 from the auth pages (Plan 3)', () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/login/?_rsc=abc')).toBe(false)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/login/?next=/cart/')).toBe(false)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/register/?_rsc=abc')).toBe(false)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/forgot-password/')).toBe(false)
  })

  it('reports a 404 from every account page (Plan 3 has built them all)', () => {
    const built = [
      '',
      'orders/?group=delivered',
      'reviews/',
      'wishlist/?sort=added-asc',
      'reading-list/',
      'comments/?type=post',
      'wallet/',
      'notifications/?_rsc=abc',
      'profile/',
      'addresses/',
    ]
    for (const path of built) {
      expect(isExpectedFailure(NOT_FOUND, `http://localhost:3000/account/${path}`), path).toBe(
        false,
      )
    }
  })

  it('reports every other message', () => {
    expect(isExpectedFailure('Minified React error #418', 'http://localhost:3000/media/a')).toBe(
      false,
    )
    expect(isExpectedFailure(NOT_FOUND, '')).toBe(false)
  })
})

describe('watchErrors', () => {
  /** The two Page events the guard listens to, fired by hand. */
  function fakePage() {
    const handlers: Record<string, (value: unknown) => void> = {}
    const page = {
      on: (event: string, handler: (value: unknown) => void) => (handlers[event] = handler),
    }
    const consoleMessage = (type: string, text: string, url: string) =>
      handlers.console?.({ type: () => type, text: () => text, location: () => ({ url }) })
    return {
      page,
      consoleMessage,
      pageError: (message: string) => handlers.pageerror?.({ message }),
    }
  }

  it('collects page errors and unexpected console errors, with their URL', () => {
    const fake = fakePage()
    const errors = watchErrors(fake.page as never)
    fake.consoleMessage('error', NOT_FOUND, 'http://localhost:8000/media/a.jpg')
    fake.consoleMessage('warning', 'just a warning', '')
    fake.consoleMessage('error', NOT_FOUND, 'http://localhost:3000/_next/static/chunks/app.js')
    fake.pageError('Hydration failed')
    expect(errors).toEqual([
      `${NOT_FOUND} (http://localhost:3000/_next/static/chunks/app.js)`,
      'Hydration failed',
    ])
  })

  it('forgets the 500 of a write the test retried after the dev database lock (cart-write)', () => {
    const fake = fakePage()
    const errors = watchErrors(fake.page as never)
    const add = 'http://localhost:3000/api/bff/cart/item/add/'
    fake.consoleMessage('error', SERVER_ERROR, add)
    fake.consoleMessage('error', SERVER_ERROR, 'http://localhost:3000/api/bff/cart/clear/')
    forgiveFailure(fake.page, add)
    // Also one the browser reports after the test accounted for it.
    fake.consoleMessage('error', SERVER_ERROR, add)
    fake.consoleMessage('error', NOT_FOUND, add)
    expect(errors).toEqual([
      `${SERVER_ERROR} (http://localhost:3000/api/bff/cart/clear/)`,
      `${NOT_FOUND} (${add})`,
    ])
    // A page nobody watches: nothing to forget.
    expect(() => forgiveFailure({}, add)).not.toThrow()
  })

  it('forgives another status when the test names it, and only that one', () => {
    const fake = fakePage()
    const errors = watchErrors(fake.page as never)
    const intent = 'http://localhost:3000/api/bff/payment/link/t/intent/'
    const unavailable =
      'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'
    fake.consoleMessage('error', unavailable, intent)
    forgiveFailure(fake.page, intent, 503)
    fake.consoleMessage('error', unavailable, intent)
    fake.consoleMessage('error', SERVER_ERROR, intent)
    expect(errors).toEqual([`${SERVER_ERROR} (${intent})`])
  })
})
