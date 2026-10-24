import { expect } from '@playwright/test'
import { controlled, keptHtml } from './support/pwa'
import { SARA, signedInTest as test } from './support/session'

// A signed-in visitor shown the home page's anonymous copy while online (Plan 5 final fix wave):
// the worker serves the copy it kept to a navigation of `/` the network has not answered in 4 s
// (the installed app's start page on a slow network), with the guest's header. The shop-wide
// session sweep sets it right on mount (src/lib/session/session-heal.ts): the header ends up the
// visitor's, without a reload. Read only: sara's shared session (no login of its own); the home
// page's own navigation is held 6 s on its way, nothing else is.

const HELD_MS = 6_000

test('a slow home page: the copy kept at 4 s, then the header is the visitor’s', async ({
  page,
  context,
}) => {
  const account = page.getByRole('banner').getByRole('button', {
    name: `حساب کاربری: ${SARA.fullName}`,
  })
  await page.goto('/')
  await controlled(page)
  await expect(account).toBeVisible()
  expect(await keptHtml(page, '/')).toContain('hasSession\\":false')

  // The worker's own request for the document `/` is held, never the router's (`rsc`) nor the
  // worker's request for the copy. Playwright cannot hold the browser's navigation preload, so
  // it is turned off here: the worker then fetches the page itself (a slow network delays
  // either the same way).
  await page.evaluate(async () => (await navigator.serviceWorker.ready).navigationPreload.disable())
  await context.route(
    (url) => url.pathname === '/',
    async (route) => {
      const request = route.request()
      const headers = request.headers()
      if (request.method() === 'GET' && !headers['rsc'] && !headers['x-ff-offline']) {
        await new Promise((resolve) => setTimeout(resolve, HELD_MS))
      }
      await route.continue()
    },
  )
  const response = await page.goto('/')
  // The copy kept (stamped by the worker when kept), not the network's page.
  expect(response?.fromServiceWorker()).toBe(true)
  expect(response?.headers()['x-ff-kept-at']).toMatch(/^\d+$/)
  await expect(account).toBeVisible({ timeout: 10_000 })
  await context.unrouteAll({ behavior: 'wait' })
})
