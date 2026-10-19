import { test } from '@playwright/test'
import {
  budgetOf,
  CHECKOUT_BUDGET_KB,
  deviceLabel,
  enforce,
  measure,
  measurePhone,
  measuresBudget,
  type BudgetRoute,
} from '../support/js-budget'
import { seedThanks, THANKS_PATH, thanksShown } from '../support/thanks-states'

// The JavaScript budget of the catalog and the auth pages for a guest (ruling P2-R4; the measure:
// support/js-budget.ts). Each route is measured twice and both figures are printed and
// enforced: on a desktop (this project's page, 1440 px) and on a phone (a fresh context: Pixel 7
// at 375 px, touch and a mobile user agent), where code may load for touch phones only. Runs in
// the desktop project only, which measures both, and again in `budget-push` (a shop with web
// push). Signed in: budget-signed-in.spec.ts.

const ROUTES: BudgetRoute[] = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/product-category/digital/mobile-phone/' },
  { name: 'list', path: '/product/list/flagship-phones/' },
  { name: 'product', path: '/product/samsung-galaxy-s25-ultra/' },
  // Every search request is logged by the backend: four loads per run (desktop and phone, in the
  // desktop and budget-push projects).
  { name: 'search', path: `/search/?q=${encodeURIComponent('گوشی')}` },
  { name: 'compare', path: '/compare/' },
  { name: 'brand', path: '/brand/samsung/' },
  { name: 'brands', path: '/brand/' },
  // Plan 5 Task 1: the blog counts as catalog-like (250 KB); its reading-list code stays off the
  // catalog's routes.
  { name: 'blog', path: '/blog/' },
  { name: 'blog-category', path: '/blog/category/buying-guide/' },
  // Plan 3: the auth code lives on these routes alone (none of it on the catalog's).
  { name: 'login', path: '/login/' },
  { name: 'register', path: '/register/' },
  { name: 'forgot-password', path: '/forgot-password/' },
  // Plan 4: the cart page's own code (coupon, notices, summary) lives on this route alone. A
  // guest without a cart gets its empty state, with every module of the page loaded all the same.
  { name: 'cart', path: '/cart/' },
  // The checkout's own code (its steps, the guest's receiver form) lives on this route alone: a
  // guest with a product in the cart, at the receiver step; and a guest back at the checkout
  // with everything chosen, at the review (support/js-budget.ts `CheckoutState`). Both are held
  // to the checkout's own target (`CHECKOUT_BUDGET_KB`).
  { name: 'checkout', path: '/checkout/', checkout: 'guest' },
  { name: 'checkout-review', path: '/checkout/', checkout: 'guest-review' },
  // The thanks page after a guest's placement (support/thanks-states.ts: this tab's hand-off,
  // nothing placed), held to the checkout's target too.
  {
    name: 'checkout-thanks',
    path: THANKS_PATH,
    shownPath: '/checkout/thanks/<code>/',
    budget: CHECKOUT_BUDGET_KB,
    prepare: (page) => seedThanks(page, { guest: true }),
    ready: (page) => thanksShown(page, { guest: true }),
  },
]

test.describe('JavaScript budget (production build)', () => {
  test.describe.configure({ mode: 'parallel' })

  for (const route of ROUTES) {
    test(`${route.name}: at most ${budgetOf(route)} KB gzip of JavaScript on desktop and phone`, async ({
      page,
      browser,
    }, info) => {
      test.skip(!measuresBudget(info.project), 'measures both viewports itself')
      test.setTimeout(90_000)
      const desktop = await measure(page, route, deviceLabel(info.project, 'desktop'))
      const phone = await measurePhone(browser, route, {
        device: deviceLabel(info.project, 'phone'),
      })
      enforce(info, desktop, phone)
    })
  }
})
