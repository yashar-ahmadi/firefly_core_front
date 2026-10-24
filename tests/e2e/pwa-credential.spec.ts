import { expect, test } from '@playwright/test'
import { controlled, goOffline, goOnline, keptHtml, OFFLINE_TITLE } from './support/pwa'

// The worker and the addresses that hold a credential (Plan 5 final fix wave). The offline page it
// keeps is shown in place of any page that failed, at that page's address, so it carries none of
// the operator's code and sends no referrer. Offline, a payment link's address, a payment's result
// page and the login that leads back to a payment link get the page built into the worker instead,
// which runs no script at all: no snippet, no `dataLayer`, nothing that could read the address.
// Read only: the payment link's token and the payment's uuid are no one's (the link's page reads
// the API once and answers its «not found»).

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'
const TOKEN = 'e2e-no-such-payment-link-token-0000000000'
const UUID = '00000000-0000-4000-8000-0000000000e2'
/** The sample data's snippets (snippets.spec.ts): GA's `dataLayer` in <head>, a seal's log. */
const SEAL_LOG = 'enamad placeholder'
const RETRY = 'تلاش دوباره'

test('the offline page kept carries none of the operator’s code and sends no referrer', async ({
  page,
  request,
}) => {
  const rows = (
    await (await request.get(`${API_URL}/api/v1/global/extra-snippets/?limit=100`)).json()
  ).data.results as { snippet: string }[]
  await page.goto('/')
  await controlled(page)
  const copy = await keptHtml(page, '/offline/')
  expect(copy).toContain(OFFLINE_TITLE)
  for (const code of ['dataLayer', SEAL_LOG, 'data-snippet-zone'])
    expect(copy, code).not.toContain(code)
  // The home page's copy, an ordinary page, has the sample data's analytics: the check can see it.
  if (rows.some((row) => row.snippet.includes('window.dataLayer')))
    expect(await keptHtml(page, '/')).toContain('dataLayer')
  const policy = await page.evaluate(
    async () => (await caches.match('/offline/'))?.headers.get('referrer-policy') ?? null,
  )
  expect(policy).toBe('no-referrer')
})

test.describe('offline at an address that holds a credential: the worker’s own page', () => {
  /** The page shown: the worker's built-in one, with nothing that runs or loads. */
  async function expectBuiltIn(page: import('@playwright/test').Page, logs: string[]) {
    await expect(page.getByRole('heading', { level: 1, name: OFFLINE_TITLE })).toBeVisible()
    expect(await page.locator('script').count(), 'no script').toBe(0)
    expect(await page.evaluate(() => 'dataLayer' in window), 'no <head> snippet').toBe(false)
    expect(await page.locator('[data-snippet-zone]').count(), 'no snippet zone').toBe(0)
    expect(logs, 'no end-of-body snippet').not.toContain(SEAL_LOG)
    // «تلاش دوباره» asks for the same address again.
    await expect(page.getByRole('link', { name: RETRY })).toHaveAttribute('href', '')
  }

  test('a payment link’s page, gone offline: reloaded, the built-in page', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await controlled(page)
    const path = `/order/pay/${TOKEN}/`
    await page.goto(path)
    await goOffline(context)
    // What the page offline logs (the home page online logged the seal's line: an ordinary page).
    const logs: string[] = []
    page.on('console', (message) => logs.push(message.text()))
    const response = await page.reload()
    expect(new URL(page.url()).pathname).toBe(path)
    expect(response?.fromServiceWorker()).toBe(true)
    expect(response?.headers()['referrer-policy']).toBe('no-referrer')
    await expectBuiltIn(page, logs)
    await goOnline(context)
  })

  for (const [name, path] of [
    ['a payment’s result page', `/payment/callback/?payment=${UUID}`],
    ['the login that leads back to a payment link', `/login/?next=/order/pay/${TOKEN}/`],
    ['the home page with a `next` to a payment link', `/?next=/order/pay/${TOKEN}/`],
  ]) {
    test(`${name}, offline: the built-in page`, async ({ page, context }) => {
      await page.goto('/')
      await controlled(page)
      await goOffline(context)
      const logs: string[] = []
      page.on('console', (message) => logs.push(message.text()))
      const response = await page.goto(path)
      expect(response?.headers()['referrer-policy']).toBe('no-referrer')
      await expectBuiltIn(page, logs)
      await goOnline(context)
    })
  }
})
