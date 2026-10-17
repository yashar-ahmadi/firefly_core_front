import { test } from '@playwright/test'
import { BUDGET_KB, enforce, measure, measurePhone, type BudgetRoute } from '../support/js-budget'

// The JavaScript budget of the catalog and the auth pages for a guest (ruling P2-R4; the measure:
// support/js-budget.ts). Each route is measured twice and both figures are printed and
// enforced: on a desktop (this project's page, 1440 px) and on a phone (a fresh context: Pixel 7
// at 375 px, touch and a mobile user agent), where code may load for touch phones only. Runs in
// the desktop project only, which measures both. Signed in: budget-signed-in.spec.ts.

const ROUTES: BudgetRoute[] = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/product-category/digital/mobile-phone/' },
  { name: 'list', path: '/product/list/flagship-phones/' },
  { name: 'product', path: '/product/samsung-galaxy-s25-ultra/' },
  // Every search request is logged by the backend: two loads per run (desktop and phone).
  { name: 'search', path: `/search/?q=${encodeURIComponent('گوشی')}` },
  { name: 'compare', path: '/compare/' },
  { name: 'brand', path: '/brand/samsung/' },
  { name: 'brands', path: '/brand/' },
  // Plan 3: the auth code lives on these routes alone (none of it on the catalog's).
  { name: 'login', path: '/login/' },
  { name: 'register', path: '/register/' },
  { name: 'forgot-password', path: '/forgot-password/' },
]

test.describe('JavaScript budget (production build)', () => {
  test.describe.configure({ mode: 'parallel' })

  for (const route of ROUTES) {
    test(`${route.name}: at most ${BUDGET_KB} KB gzip of JavaScript on desktop and phone`, async ({
      page,
      browser,
    }, info) => {
      test.skip(info.project.name !== 'desktop', 'measures both viewports itself')
      test.setTimeout(90_000)
      const desktop = await measure(page, route, 'desktop')
      const phone = await measurePhone(browser, route)
      enforce(info, desktop, phone)
    })
  }
})
