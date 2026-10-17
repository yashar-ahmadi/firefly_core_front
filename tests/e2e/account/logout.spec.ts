import { expect, test, type Page } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { logIn, SARA } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// Logout (auth digest F6) against the dev backend. This spec ends its session, so it logs in on
// its own (`logIn`, once per project; see support/session.ts), then logs out from where the
// screen offers it: the header's account menu from md; on a phone (no header menu, and the
// bottom bar's account page comes with Task 5) the login page's signed-in panel. Both use
// `useLogout`.

const GUEST_LOGIN = /^ورود/

/** No cookie of ours is left: the session's are deleted, and no guest cart was made. */
async function expectNoShopCookies(page: Page) {
  const ours = (await page.context().cookies()).filter((cookie) => cookie.name.startsWith('ff_'))
  expect(ours.map((cookie) => cookie.name)).toEqual([])
}

function accountTab(page: Page) {
  return page.getByRole('navigation', { name: 'منوی پایین' }).getByRole('link', { name: 'حساب من' })
}

test('logs out: the guest header is back, the session cookies are gone', async ({
  page,
  baseURL,
}) => {
  const errors = watchErrors(page)
  const origin = baseURL ?? 'http://localhost:3000'
  await logIn(page.context(), origin)
  const phone = (page.viewportSize()?.width ?? 0) < 768
  const banner = page.getByRole('banner')

  if (phone) {
    await page.goto('/login/')
    await expect(page.getByRole('heading', { name: 'شما وارد شده‌اید' })).toBeVisible()
    await expect(page.getByText(`با حساب «${SARA.fullName}» وارد شده‌اید.`)).toBeVisible()
    await page.getByRole('button', { name: 'خروج' }).click()
    await expect(page).toHaveURL(`${origin}/`)
    await expect(accountTab(page)).toHaveAttribute('href', '/login/?next=/account/')
  } else {
    await page.goto('/')
    await shellHydrated(page)
    const button = banner.getByRole('button', { name: `حساب کاربری: ${SARA.fullName}` })
    await button.click()
    const menu = page.getByRole('menu')
    await expect(menu.getByText(SARA.fullName)).toBeVisible()
    await expect(menu.getByText(SARA.email)).toBeVisible()
    await menu.getByRole('menuitem', { name: 'خروج' }).click()
    const login = banner.getByRole('link', { name: GUEST_LOGIN })
    await expect(login).toBeVisible()
    // The login link took the account button's place, and the focus with it.
    await expect(login).toBeFocused()
    await expect(menu).toHaveCount(0)
  }
  await expect(page.locator('[data-sonner-toast]', { hasText: 'از حساب خارج شدید' })).toBeVisible()
  await expectNoShopCookies(page)

  // The server sees a guest too: a reload keeps the guest header.
  await page.reload()
  await shellHydrated(page)
  if (phone) await expect(accountTab(page)).toHaveAttribute('href', '/login/?next=/account/')
  else await expect(banner.getByRole('link', { name: GUEST_LOGIN })).toBeVisible()
  await expect(banner.getByRole('button', { name: /^حساب کاربری/ })).toHaveCount(0)
  expect(errors).toEqual([])
})
