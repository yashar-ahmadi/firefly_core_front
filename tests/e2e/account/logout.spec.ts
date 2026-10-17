import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { logIn, SARA } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// Logout (auth digest F6) against the dev backend. This spec ends its session, so it logs in on
// its own (`logIn`, once per project; see support/session.ts), then logs out from where the
// screen offers it: the header's account menu from md; on a phone (no header menu, and the
// bottom bar's account page comes with Task 5) the login page's signed-in panel. Both use
// `useLogout`.

const GUEST_LOGIN = /^ورود/
const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'

/** The header's guest link: «ورود | ثبت‌نام» while registration is open, else «ورود». */
async function guestLinkName(request: APIRequestContext): Promise<string> {
  const feature = await request.get(`${API_URL}/api/v1/global/feature-status/registration/`)
  expect(feature.ok(), 'the registration feature').toBe(true)
  const { is_enabled } = ((await feature.json()) as { data: { is_enabled: boolean } }).data
  return is_enabled ? 'ورود | ثبت\u{200C}نام' : 'ورود'
}

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
  request,
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

  // Usable without a reload (the modal menu's pointer lock went with it): on to the login page,
  // which shows a guest the form (a signed-in visitor would get «شما وارد شده‌اید»).
  if (phone) await accountTab(page).click()
  else await banner.getByRole('link', { name: GUEST_LOGIN }).click()
  await expect(page).toHaveURL(new RegExp(`^${origin}/login/`))
  await expect(page.getByLabel('ایمیل یا شماره موبایل')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'شما وارد شده‌اید' })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.pointerEvents)).toBe('')

  // The server sees a guest too: a fresh load of the home page has the guest header.
  await page.goto('/')
  await shellHydrated(page)
  if (phone) await expect(accountTab(page)).toHaveAttribute('href', '/login/?next=/account/')
  else await expect(banner.getByRole('link', { name: await guestLinkName(request) })).toBeVisible()
  await expect(banner.getByRole('button', { name: /^حساب کاربری/ })).toHaveCount(0)

  // And the account is closed to it: login, with the account as `next` (kept readable).
  await page.goto('/account/')
  await expect(page).toHaveURL(`${origin}/login/?next=/account/`)
  await expect(page.getByLabel('ایمیل یا شماره موبایل')).toBeVisible()
  expect(errors).toEqual([])
})
