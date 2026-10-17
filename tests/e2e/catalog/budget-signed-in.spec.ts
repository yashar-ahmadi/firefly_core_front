import {
  BUDGET_KB,
  deviceLabel,
  enforce,
  measure,
  measurePhone,
  measuresBudget,
  pushShop,
  type BudgetRoute,
} from '../support/js-budget'
import { signedInTest } from '../support/session'

// The JavaScript budget signed in (ruling P2-R4; the measure: support/js-budget.ts): the catalog
// as sara sees it (her header, hearts and cart) and the account pages that carry the most code.
// The project's shared session on a desktop (1440 px) and on a phone (a fresh Pixel 7 context at
// 375 px with the same session). Runs in the desktop project only, which measures both, and
// again in `budget-push` (a shop with web push; the same session), with push on in the browser:
// the re-register effect's chunk loads there, the costliest case.

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
        signedInTest.skip(!measuresBudget(info.project), 'measures both viewports itself')
        signedInTest.setTimeout(90_000)
        const push = pushShop(info.project)
        const label = (device: string) =>
          deviceLabel(info.project, push ? `${device}, push on` : device)
        const desktop = await measure(page, route, label('desktop, signed in'), {
          signedIn: true,
          push,
        })
        const phone = await measurePhone(browser, route, {
          storageState: saraState,
          device: label('phone, signed in'),
          signedIn: true,
          push,
        })
        enforce(info, desktop, phone)
      },
    )
  }
})
