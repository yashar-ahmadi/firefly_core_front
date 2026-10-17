import { expect } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { SARA, SESSION_COOKIES, signedInTest } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// A session that ended in another tab (a logout there, or its refresh cookie expired), then a
// link to another account page in this one (Plan 3 Task 5's guard, Review Focus #4): the tab
// still thinks it is signed in, the server does not, and a client-side navigation lands on
// login with the page as `next`, as a guest's (never «شما وارد شده‌اید» with the old profile).
// The other tab is played by dropping this context's session cookies: the shared session itself
// is left alone at the API (no logout, no login). Then the same with no navigation at all: the
// account tab gets the focus back (the shop-wide SessionSwitchSweep), its data must go with the
// page; and a catalog tab becomes a guest's in place (Plan 4 Task 1, fix round 1).

signedInTest(
  'a session ended in another tab: the next account page is login, with it as next',
  async ({ page, context }) => {
    const errors = watchErrors(page)
    await page.goto('/account/')
    await expect(page.getByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()
    await shellHydrated(page)

    for (const name of SESSION_COOKIES) await context.clearCookies({ name })
    const documents: string[] = []
    page.on('request', (request) => {
      if (request.isNavigationRequest()) documents.push(request.url())
    })
    await page
      .getByRole('navigation', { name: 'حساب کاربری' })
      .getByRole('link', { name: /^اطلاعات حساب/ })
      .click()
    // (Next's router spells the query of a redirected navigation its own way: `%2F` or `/`.)
    await expect(page).toHaveURL(
      (url) => url.pathname === '/login/' && url.searchParams.get('next') === '/account/profile/',
    )
    await expect(page.getByLabel('ایمیل یا شماره موبایل')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'شما وارد شده‌اید' })).toHaveCount(0)
    // In the page: no document was loaded on the way.
    expect(documents).toEqual([])
    expect(errors).toEqual([])
  },
)

signedInTest(
  'a session ended in another tab: back to this one, its account page goes, data and all',
  async ({ page, context }) => {
    const errors = watchErrors(page)
    await page.goto('/account/profile/')
    const email = page.getByRole('group', { name: 'ایمیل', exact: true })
    await expect(email).toContainText(SARA.email)
    await shellHydrated(page)

    // Another tab, where the session ends (its logout drops the cookies both tabs share).
    const other = await context.newPage()
    await other.goto('/')
    for (const name of SESSION_COOKIES) await context.clearCookies({ name })
    // Back to the account tab: it ends the session there too, and login takes the page's place.
    // (Headless pages never lose the focus, so the event a browser sends then is played here.)
    await page.bringToFront()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page).toHaveURL(
      (url) => url.pathname === '/login/' && url.searchParams.get('next') === '/account/profile/',
    )
    await expect(page.getByLabel('ایمیل یا شماره موبایل')).toBeVisible()
    await expect(page.getByText(SARA.email)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'شما وارد شده‌اید' })).toHaveCount(0)
    expect(errors).toEqual([])
  },
)

signedInTest(
  'a session ended in another tab: back to a catalog tab, its header is a guest’s, no reload',
  async ({ page, context }) => {
    const errors = watchErrors(page)
    await page.goto('/product-category/digital/mobile-phone/')
    await shellHydrated(page)
    const phone = (page.viewportSize()?.width ?? 0) < 768
    const banner = page.getByRole('banner')
    const accountTab = page
      .getByRole('navigation', { name: 'منوی پایین' })
      .getByRole('link', { name: 'حساب من' })
    if (phone) await expect(accountTab).toHaveAttribute('href', '/account/')
    else {
      await expect(
        banner.getByRole('button', { name: `حساب کاربری: ${SARA.fullName}` }),
      ).toBeVisible()
    }
    const documents: string[] = []
    page.on('request', (request) => {
      if (request.isNavigationRequest()) documents.push(request.url())
    })

    // Another tab, where the session ends (its logout drops the cookies both tabs share).
    for (const name of SESSION_COOKIES) await context.clearCookies({ name })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    if (phone) await expect(accountTab).toHaveAttribute('href', '/login/?next=/account/')
    else {
      await expect(banner.getByRole('link', { name: /^ورود/ })).toBeVisible()
      await expect(banner.getByRole('button', { name: /^حساب کاربری/ })).toHaveCount(0)
    }
    await expect(page.getByText(SARA.fullName)).toHaveCount(0)
    // The catalog page itself is everyone's: it stays, no document loaded.
    expect(documents).toEqual([])
    expect(errors).toEqual([])
  },
)
