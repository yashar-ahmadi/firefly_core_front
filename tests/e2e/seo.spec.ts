import { expect, test, type APIRequestContext } from '@playwright/test'
import { signedInTest } from './support/session'
import {
  canonicalsIn,
  expectCanonical,
  h1CountIn,
  jsonLdOf,
  POST_PATH,
  robotsMetas,
  saysNoindex,
  typesIn,
} from './support/seo-head'
import { hrefsIn, menuLinkUrls } from './support/menu-links'
import { watchErrors } from './support/watch-errors'

// The SEO audit (Plan 5 Task 7; spec §8.13, seo digest §7 and §13) on the production build: every
// indexable route type has one <h1>, a title, one absolute canonical on the shop's own origin
// ending with `/`, JSON-LD that parses with the types it should have, `og:title` and no
// noindex; every private, transactional or thin route says noindex (a robots meta tag or
// `X-Robots-Tag`), and the pages whose URL holds a payment credential send no referrer. Read
// only, desktop only (one pass a run). One blog post page only (ruling P5-R1: each GET of a post
// counts a view).

/**
 * One page of each indexable route type, and the JSON-LD types it must carry (every block must
 * parse).
 */
const INDEXABLE: [name: string, path: string, types: string[]][] = [
  ['home', '/', ['Organization', 'WebSite']],
  ['category', '/product-category/digital/mobile-phone/', ['BreadcrumbList']],
  ['brand', '/brand/samsung/', ['BreadcrumbList']],
  ['brands index', '/brand/', ['BreadcrumbList']],
  ['categories tab', '/categories/', ['BreadcrumbList']],
  ['list page', '/product/list/flagship-phones/', ['BreadcrumbList']],
  ['product', '/product/samsung-galaxy-s25-ultra/', ['Product', 'BreadcrumbList']],
  ['blog home', '/blog/', ['Blog', 'BreadcrumbList']],
  ['post', POST_PATH, ['BlogPosting', 'BreadcrumbList']],
  ['blog category', '/blog/category/buying-guide/', ['CollectionPage', 'BreadcrumbList']],
  ['page', '/page/about-us/', ['BreadcrumbList']],
  ['FAQ', '/faq/', ['FAQPage']],
  ['contact', '/contact-us/', ['BreadcrumbList']],
  ['linker', '/links/', ['ProfilePage']],
]

const CARD_TRANSFER = '/payment/card-transfer/00000000-0000-4000-8000-000000000000/'
const PAY_LINK = '/order/pay/e2e-no-such-token/'

/**
 * Pages that must never be indexed, as a guest, with the status each answers (200 unless noted);
 * `credential`: their URL holds a payment key.
 */
const NOINDEX: [path: string, options?: { status?: 404; credential?: true }][] = [
  ['/cart/'],
  ['/checkout/'],
  ['/checkout/thanks/5550001234/'],
  ['/search/'],
  ['/compare/'],
  ['/product/list/'],
  ['/product/list/?has_discount=true'],
  ['/product-category/digital/mobile-phone/?sort=price-asc'],
  ['/login/'],
  ['/register/'],
  ['/forgot-password/'],
  ['/order/track/'],
  // An unknown token: the link's own 404 page, a real 404 (R9).
  [PAY_LINK, { status: 404, credential: true }],
  ['/payment/callback/', { credential: true }],
  ['/payment/callback/?result=failed&code=gateway_callback_invalid', { credential: true }],
  // The page reads the attempt in the browser: an unknown uuid is still the page.
  [CARD_TRANSFER, { credential: true }],
  [`/login/?next=${PAY_LINK}`, { credential: true }],
  ['/offline/'],
  // The shop's 404 (an unknown URL, through the catch-all) and the light root 404 (a malformed
  // thanks code, outside the shop layout: ruling P5-R2).
  ['/this-page-does-not-exist/', { status: 404 }],
  ['/checkout/thanks/not-a-code/', { status: 404 }],
]

async function served(request: APIRequestContext, path: string) {
  const response = await request.get(path, { maxRedirects: 0 })
  return { response, html: await response.text() }
}

test.describe('SEO', () => {
  test.beforeAll(({}, workerInfo) => {
    test.skip(workerInfo.project.name !== 'desktop', 'one pass a run (desktop project)')
  })

  for (const [name, path, types] of INDEXABLE) {
    test(`indexable: ${name} (${path})`, async ({ page, baseURL }) => {
      const errors = watchErrors(page)
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      const html = (await response?.text()) ?? ''
      // In the HTML as served, before any script, and in the page as shown.
      expect(h1CountIn(html), `${path}: one <h1> served`).toBe(1)
      await expect(page.locator('h1'), `${path}: one <h1> shown`).toHaveCount(1)
      expect((await page.title()).trim(), `${path}: a title`).not.toBe('')
      const origin = new URL(baseURL!).origin
      expect(await expectCanonical(page, origin, path)).toBe(new URL(path, origin).pathname)
      const found = (await jsonLdOf(page)).flatMap(typesIn)
      for (const type of types) expect(found, `${path}: JSON-LD ${type}`).toContain(type)
      // One description: none wiped by a key set to undefined, none written twice.
      const description = page.locator('meta[name="description"]')
      await expect(description, `${path}: one description`).toHaveCount(1)
      expect((await description.getAttribute('content'))?.trim(), path).toBeTruthy()
      const ogTitle = page.locator('meta[property="og:title"]')
      await expect(ogTitle, `${path}: og:title`).toHaveCount(1)
      expect((await ogTitle.getAttribute('content'))?.trim(), `${path}: og:title`).toBeTruthy()
      expect(
        robotsMetas(html).filter((content) => /noindex/i.test(content)),
        path,
      ).toEqual([])
      expect(response?.headers()['x-robots-tag'] ?? '', path).not.toMatch(/noindex/i)
      expect(errors).toEqual([])
    })
  }

  test('every link of the header’s menu is an <a href> in a shop page’s HTML as served', async ({
    request,
    baseURL,
  }) => {
    // The mega-menu's and the drawer's panels load on demand: the header carries the menu as a
    // hidden list of plain links (MenuLinkTree), so crawlers reach every category (spec §8.13).
    const urls = await menuLinkUrls(request, new URL(baseURL!).origin)
    expect(urls.length).toBeGreaterThan(0)
    for (const path of ['/', '/faq/']) {
      const found = hrefsIn((await served(request, path)).html)
      for (const url of urls) expect(found.has(url), `${path}: <a href="${url}">`).toBe(true)
    }
  })

  test('the product’s JSON-LD keeps the API’s Rial prices labelled as Rial (never shown)', async ({
    request,
  }) => {
    const { html } = await served(request, '/product/samsung-galaxy-s25-ultra/')
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    const product = blocks
      .map((match) => JSON.parse(match[1]!) as Record<string, unknown>)
      .find((block) => block['@type'] === 'Product')
    expect((product?.offers as { priceCurrency?: string } | undefined)?.priceCurrency).toBe('IRR')
  })

  test('noindex: private, transactional and thin pages; no referrer from credential pages', async ({
    request,
  }) => {
    for (const [path, { status = 200, credential = false } = {}] of NOINDEX) {
      const { response, html } = await served(request, path)
      expect(response.status(), path).toBe(status)
      expect(saysNoindex(response, html), `${path}: noindex`).toBe(true)
      // One robots tag: on a 404, Next's own noindex and no layout's beside it.
      expect(robotsMetas(html), `${path}: one robots tag`).toHaveLength(1)
      // noindex with a canonical to another URL would be a mixed signal.
      for (const canonical of canonicalsIn(html)) {
        expect(new URL(canonical).pathname, `${path}: canonical`).toBe(
          new URL(path, canonical).pathname,
        )
      }
      if (credential) {
        expect(response.headers()['referrer-policy'], `${path}: no referrer`).toBe('no-referrer')
        expect(canonicalsIn(html), `${path}: names no URL`).toEqual([])
      }
    }
  })
})

signedInTest.describe('SEO, signed in', () => {
  signedInTest.beforeAll(({}, workerInfo) => {
    signedInTest.skip(workerInfo.project.name !== 'desktop', 'one pass a run (desktop project)')
  })

  signedInTest('the account pages are noindex, with one robots tag', async ({ page }) => {
    for (const [path, status] of [
      ['/account/', 200],
      ['/account/orders/', 200],
      ['/account/profile/', 200],
      // An order that is not the account's: the account shell's 404 (read only).
      ['/account/orders/0000000000/', 404],
    ] as const) {
      const response = await page.request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(status)
      const html = await response.text()
      expect(saysNoindex(response, html), `${path}: noindex`).toBe(true)
      expect(robotsMetas(html), `${path}: one robots tag`).toHaveLength(1)
    }
  })
})
