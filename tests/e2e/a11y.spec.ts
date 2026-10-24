import { expect, test, type Page } from '@playwright/test'
import { axeFindings, axeReport, blocking, settled } from './support/axe'
import { checkoutReached, leaveCheckout, prepareCheckout } from './support/checkout-states'
import { shellHydrated } from './support/hydrated'
import { POST_PATH } from './support/seo-head'
import { signedInTest } from './support/session'

// Accessibility audit (Plan 5 Task 8; spec §7.1, WCAG 2.1 AA) with axe-core on the production
// build, on a phone (Pixel 7) and a desktop: no `serious` or `critical` violation of the WCAG
// 2.0/2.1 A and AA rules on any page type a visitor reaches. No rule is turned off; only
// third-party embeds are left out, element by element (support/axe.ts). Every finding,
// whatever its impact, is printed (`[axe] …`) for the audit's report.
//
// Read only, but for guest carts this test's own context makes and clears (the cart with a line
// and the checkout's receiver and review steps: support/checkout-states.ts). One blog post only
// (ruling P5-R1: each load counts a view; two a run). The account as sara's shared session reads it.

/** The shop's pages: the shell hydrated before the audit. */
const SHOP_PAGES: [name: string, path: string][] = [
  ['home', '/'],
  ['category', '/product-category/digital/mobile-phone/'],
  ['product', '/product/samsung-galaxy-s25-ultra/'],
  ['cart, empty', '/cart/'],
  ['blog home', '/blog/'],
  ['post', POST_PATH],
  ['content page', '/page/about-us/'],
  ['FAQ', '/faq/'],
  ['contact', '/contact-us/'],
  ['order tracking', '/order/track/'],
  ['shop 404', '/this-page-does-not-exist/'],
]

/** Pages outside the shop's frame (sign-in, linker, the light 404, offline). */
const OTHER_PAGES: [name: string, path: string][] = [
  ['login', '/login/'],
  ['register', '/register/'],
  ['links', '/links/'],
  ['light 404', '/checkout/thanks/not-a-code/'],
  ['offline', '/offline/'],
]

async function audit(page: Page, label: string): Promise<void> {
  await settled(page)
  const findings = await axeFindings(page)
  console.log(axeReport(label, findings))
  expect(blocking(findings), `${label}: serious or critical violations`).toEqual([])
}

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'a phone and a desktop')
  })

  for (const [name, path] of SHOP_PAGES) {
    test(`${name} (${path})`, async ({ page }, testInfo) => {
      await page.goto(path)
      await shellHydrated(page)
      await audit(page, `${name} ${testInfo.project.name}`)
    })
  }

  for (const [name, path] of OTHER_PAGES) {
    test(`${name} (${path})`, async ({ page }, testInfo) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await audit(page, `${name} ${testInfo.project.name}`)
    })
  }

  test('the cart with a line', async ({ page }, testInfo) => {
    await prepareCheckout(page, 'guest')
    try {
      await page.goto('/cart/')
      await shellHydrated(page)
      const lines = page.getByRole('region', { name: 'کالاهای سبد خرید' }).getByRole('listitem')
      await expect(lines).toHaveCount(1)
      await audit(page, `cart with a line ${testInfo.project.name}`)
    } finally {
      await leaveCheckout(page, 'guest')
    }
  })

  for (const state of ['guest', 'guest-review'] as const) {
    test(`the checkout: ${state === 'guest' ? 'the receiver step' : 'the review'}`, async ({
      page,
    }, testInfo) => {
      await prepareCheckout(page, state)
      try {
        await page.goto('/checkout/')
        await checkoutReached(page, state, testInfo.project.name)
        await audit(page, `checkout ${state} ${testInfo.project.name}`)
      } finally {
        await leaveCheckout(page, state)
      }
    })
  }
})

signedInTest.describe('accessibility, signed in (axe)', () => {
  signedInTest.beforeEach(({}, testInfo) => {
    signedInTest.skip(testInfo.project.name === 'tablet', 'a phone and a desktop')
  })

  signedInTest('the account dashboard', async ({ page }, testInfo) => {
    await page.goto('/account/')
    await shellHydrated(page)
    await expect(page.getByRole('heading', { level: 1, name: /^سلام/ })).toBeVisible()
    await audit(page, `account ${testInfo.project.name}`)
  })
})
