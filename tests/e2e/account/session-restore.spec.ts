import { expect, test } from '@playwright/test'
import { scheduledWorkDone } from '../support/hydrated'
import { logInWithForm, logOut } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// Back to an auth page after logging in (Plan 3 Task 5, fix round 1). The auth layout was last
// rendered for a guest, and Next replays that render on a back/forward visit: the tab must keep
// its session (SessionCheck reads the flag cookie, not the replayed value). This spec logs in
// through the form, once per project, and logs that session out at the end.

test('Back to an auth page after logging in keeps the session', async ({ page, baseURL }) => {
  const errors = watchErrors(page)
  const origin = baseURL ?? 'http://localhost:3000'
  await page.goto('/register/')
  await page.getByRole('link', { name: 'وارد شوید' }).click()
  await expect(page).toHaveURL(/\/login\//)
  await logInWithForm(page)
  await expect(page).toHaveURL(`${origin}/account/`)
  await expect(page.getByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()

  try {
    // The login replaced its own history entry: Back is the guest's registration page.
    await page.goBack()
    await expect(page).toHaveURL(/\/register\//)
    const panel = page.getByRole('heading', { name: 'شما وارد شده‌اید' })
    await expect(panel).toBeVisible()
    // Still signed in once the check has run (an effect, after the layout mounts).
    await scheduledWorkDone(page)
    await expect(panel).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)

    // And the account still reads her data (no session flag turned off under it).
    await page.getByRole('link', { name: 'حساب کاربری من' }).click()
    await expect(page).toHaveURL(`${origin}/account/`)
    await expect(page.getByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'سفارش‌های من' }).getByRole('link', { name: /سفارش$/ }),
    ).toHaveCount(5)
    expect(errors).toEqual([])
  } finally {
    await logOut(page.context(), origin)
  }
})
