import { BUDGET_KB, enforce, measure, measurePhone, type BudgetRoute } from '../support/js-budget'
import { signedInTest } from '../support/session'

// The JavaScript budget signed in (ruling P2-R4; the measure: support/js-budget.ts): the catalog
// as sara sees it (her header, hearts and cart) and the account pages that carry the most code.
// The project's shared session on a desktop (1440 px) and on a phone (a fresh Pixel 7 context at
// 375 px with the same session). Runs in the desktop project only, which measures both.

const ROUTES: BudgetRoute[] = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/product-category/digital/mobile-phone/' },
  { name: 'product', path: '/product/samsung-galaxy-s25-ultra/' },
  { name: 'account', path: '/account/' },
  { name: 'profile', path: '/account/profile/' },
  { name: 'notifications', path: '/account/notifications/' },
]

signedInTest.describe('JavaScript budget, signed in (production build)', () => {
  signedInTest.describe.configure({ mode: 'parallel' })

  for (const route of ROUTES) {
    signedInTest(
      `${route.name} signed in: at most ${BUDGET_KB} KB gzip of JavaScript on desktop and phone`,
      async ({ page, browser, saraState }, info) => {
        signedInTest.skip(info.project.name !== 'desktop', 'measures both viewports itself')
        signedInTest.setTimeout(90_000)
        const desktop = await measure(page, route, 'desktop, signed in', { signedIn: true })
        const phone = await measurePhone(browser, route, {
          storageState: saraState,
          device: 'phone, signed in',
          signedIn: true,
        })
        enforce(info, desktop, phone)
      },
    )
  }
})
