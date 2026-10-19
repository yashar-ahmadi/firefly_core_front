import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { signedInTest } from './support/session'

// The route table against the production build (ruling P5-R2): unknown URLs go through the shop
// group's catch-all (`src/app/(shop)/[...missing]`), which Next ranks below every other route.
// Each route family answers with its own status, never the catch-all's 404; every 404 keeps a
// real 404 status in its shell (the shop's for unknown URLs and shop pages, the light root one
// for notFound() outside the shop layout); the proxy still runs first for unknown paths. Raw HTTP,
// nothing followed. Desktop only: one pass a run (a post's page counts a view; every page here is
// one anonymous render or two).

const PAGE_404 = 'صفحه پیدا نشد'

function get(request: APIRequestContext, path: string): Promise<APIResponse> {
  return request.get(path, { maxRedirects: 0 })
}

/** The page's <title>, as served. */
async function titleOf(response: APIResponse): Promise<string> {
  return /<title>([^<]*)<\/title>/.exec(await response.text())?.[1] ?? ''
}

/**
 * A 404 as the browser shows it (Next sends a 404's body in its payload, drawn on load): its
 * status, then whether it is the shop's (the shop header's search and the 404's own) or the light
 * root one (its navigation of ways on), and how many <main> the page has.
 */
async function shown404(page: Page, path: string) {
  const response = await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  return {
    status: response?.status(),
    shop: (await page.getByRole('main').getByRole('search').count()) === 1,
    light: (await page.getByRole('navigation', { name: 'راه\u{200C}های ادامه' }).count()) === 1,
    mains: await page.locator('main').count(),
    title: await page.title(),
  }
}

/** Pages that answer 200: a real route of each family (the catch-all can only answer 404). */
const PAGES = [
  '/',
  '/product/samsung-galaxy-s25-ultra/',
  '/product-category/digital/mobile-phone/',
  '/brand/',
  '/brand/samsung/',
  '/product/list/flagship-phones/',
  '/search/',
  '/compare/',
  '/categories/',
  '/cart/',
  '/blog/',
  '/blog/category/buying-guide/',
  '/blog/best-phones-under-30m/',
  '/page/about-us/',
  '/faq/',
  '/contact-us/',
  '/links/',
  '/login/',
  '/register/',
  '/forgot-password/',
  '/checkout/',
  '/checkout/thanks/5550001234/',
  '/order/track/',
  '/payment/callback/',
  '/payment/card-transfer/00000000-0000-4000-8000-000000000000/',
]

/** Route handlers and forwarded files: their own status and type. */
const FILES: [path: string, type: RegExp][] = [
  ['/sw.js', /javascript/],
  ['/favicon.ico', /^image\//],
  ['/robots.txt', /^text\/plain/],
  ['/sitemap.xml', /xml/],
  ['/healthz/', /^text\/plain/],
]

test.describe('route table', () => {
  test.beforeAll(({}, workerInfo) => {
    test.skip(workerInfo.project.name !== 'desktop', 'one pass a run (desktop project)')
  })

  test('every page family answers 200 from its own route', async ({ request }) => {
    for (const path of PAGES) {
      const response = await get(request, path)
      expect(response.status(), path).toBe(200)
      expect(await titleOf(response), path).not.toMatch(new RegExp(`^${PAGE_404} \\|`))
    }
  })

  test('route handlers and forwarded files answer as themselves', async ({ request }) => {
    for (const [path, type] of FILES) {
      const response = await get(request, path)
      expect(response.status(), path).toBe(200)
      expect(response.headers()['content-type'], path).toMatch(type)
    }
    const bff = await request.get('/api/bff/global/settings/', {
      headers: { 'X-Requested-With': 'ff' },
    })
    expect(bff.status()).toBe(200)
    expect(bff.headers()['content-type']).toContain('application/json')
  })

  test('routes with a 404 of their own keep it', async ({ request }) => {
    // A pay link the API does not know: its calm refusal in the checkout's frame.
    const payLink = await get(request, '/order/pay/bad-token-e2e/')
    expect(payLink.status()).toBe(404)
    expect(await titleOf(payLink)).not.toMatch(new RegExp(`^${PAGE_404}`))
    // An unknown short link: the route handler's own Persian page, no app around it.
    const shortLink = await get(request, '/s/zzzz-nope/')
    expect(shortLink.status()).toBe(404)
    expect(await shortLink.text()).not.toContain('/_next/static/')
  })

  test('redirects run before any route: next.config’s and the account guard', async ({
    request,
  }) => {
    for (const path of ['/contact/', '/page/contact-us/']) {
      const response = await get(request, path)
      expect(response.status(), path).toBe(308)
      expect(response.headers()['location'], path).toMatch(/\/contact-us\/$/)
    }
    const account = await get(request, '/account/nope/')
    expect(account.status()).toBe(307)
    expect(account.headers()['location']).toContain('/login/?next=/account/nope/')
  })

  test('unknown URLs go through the proxy first, then the catch-all’s 404', async ({ request }) => {
    // The operator's redirect for an unknown path (`/festival/` → 302) is edge.spec.ts's. Here:
    // the proxy marks what it renders a page (its redirect lookup ran), so the operator's <head>
    // snippet is in the payload; a path it leaves alone gets none.
    for (const path of ['/this-does-not-exist/', '/order/', '/old-page.html', '/OLD-PAGE.PHP']) {
      const response = await get(request, path)
      expect(response.status(), path).toBe(404)
      const html = await response.text()
      expect(html, `${path}: noindex`).toMatch(/<meta name="robots" content="noindex/)
      expect(html, `${path}: through the proxy`).toContain('window.dataLayer')
    }
    // Left alone by the proxy, as before: an asset file, and `/api/` (route handlers).
    for (const path of ['/no-such-file.png', '/api/nope/']) {
      const response = await get(request, path)
      expect(response.status(), path).toBe(404)
      expect(await response.text(), path).not.toContain('window.dataLayer')
    }
  })

  test('unknown URLs and shop pages’ notFound(): the shop’s 404, a real 404', async ({ page }) => {
    for (const path of [
      '/this-does-not-exist/',
      '/old-page.html',
      '/product/no-such-product-e2e/',
      '/product-category/no-such-category-e2e/',
      '/brand/no-such-brand-e2e/',
      '/blog/no-such-post-e2e/',
      '/page/no-such-page-e2e/',
    ]) {
      const shown = await shown404(page, path)
      expect(shown, path).toMatchObject({ status: 404, shop: true, light: false, mains: 1 })
      expect(shown.title, path).toMatch(new RegExp(`^${PAGE_404} \\|`))
    }
  })

  test('notFound() outside the shop layout: the light root 404, a real 404', async ({ page }) => {
    // In the checkout's frame (its <main>, no second one); the dev pages have no frame.
    const thanks = await shown404(page, '/checkout/thanks/bad/')
    expect(thanks).toMatchObject({ status: 404, shop: false, light: true, mains: 1 })
    expect(thanks.title).toMatch(new RegExp(`^${PAGE_404} \\|`))
    expect(await shown404(page, '/dev/ui/')).toMatchObject({
      status: 404,
      shop: false,
      light: true,
    })
  })
})

signedInTest.describe('route table, signed in', () => {
  signedInTest.beforeAll(({}, workerInfo) => {
    signedInTest.skip(workerInfo.project.name !== 'desktop', 'one pass a run (desktop project)')
  })

  signedInTest('account pages answer 200; an unknown one is the shop’s 404', async ({ page }) => {
    for (const path of ['/account/', '/account/orders/', '/account/profile/']) {
      expect((await get(page.request, path)).status(), path).toBe(200)
    }
    expect(await shown404(page, '/account/nope/')).toMatchObject({
      status: 404,
      shop: true,
      light: false,
      mains: 1,
    })
  })
})
