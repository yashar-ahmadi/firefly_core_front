import { expect } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { SESSION_COOKIES, signedInTest } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// A session that ended in another tab (a logout there, or its refresh cookie expired), then a
// link to another account page in this one (Plan 3 Task 5's guard, Review Focus #4): the tab
// still thinks it is signed in, the server does not, and a client-side navigation lands on
// login with the page as `next`, as a guest's (never «شما وارد شده‌اید» with the old profile).
// The other tab is played by dropping this context's session cookies: the shared session itself
// is left alone at the API (no logout, no login).

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
