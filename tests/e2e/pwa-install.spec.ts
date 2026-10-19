import { devices, expect, test, type Browser, type Page } from '@playwright/test'
import { VISITS_KEY } from '@/features/pwa/install-state'

// The PWA's install prompt (Plan 5 Task 6), FEATURE_PWA on: on a phone, from the second visit
// (the registration script counts them), with the browser's install offer (Chromium's
// `beforeinstallprompt`, which headless Chromium never sends: dispatched here, shaped like it),
// or on an iPhone's Safari how to add the shop to the home screen. Never on a wide screen, never
// on the visitor's own pages, never again once dismissed.

const PIXEL = devices['Pixel 7']
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'

/** A phone that has been here before (the visit count past one). */
async function returningPhone(browser: Browser, baseURL: string, userAgent = PIXEL.userAgent) {
  const context = await browser.newContext({ ...PIXEL, userAgent, baseURL })
  await context.addInitScript((key) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, '1')
  }, VISITS_KEY)
  return context
}

/** Chromium's install offer, as the page would receive it (`prompt` records the press). */
function offerInstall(page: Page) {
  return page.evaluate(() => {
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        ;(window as unknown as { prompted?: boolean }).prompted = true
      },
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    window.dispatchEvent(offer)
  })
}

const banner = (page: Page) => page.getByRole('region', { name: /^نصب برنامهٔ/ })

test.describe('the install prompt', () => {
  test('a returning phone with the browser’s offer: «نصب» opens its dialog, then never again', async ({
    browser,
    baseURL,
  }) => {
    const context = await returningPhone(browser, baseURL!)
    const page = await context.newPage()
    await page.goto('/')
    await offerInstall(page)
    await expect(banner(page)).toBeVisible()
    // Never takes the focus; its controls are 44 px.
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
    const install = banner(page).getByRole('button', { name: 'نصب' })
    expect((await install.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await install.click()
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(
      true,
    )
    await expect(banner(page)).toHaveCount(0)
    await page.reload()
    await offerInstall(page)
    await page.waitForTimeout(500)
    await expect(banner(page)).toHaveCount(0)
    await context.close()
  })

  test('the first visit, the cart, a wide screen: no prompt', async ({
    browser,
    baseURL,
    page,
  }) => {
    const first = await browser.newContext({ ...PIXEL, baseURL })
    const fresh = await first.newPage()
    await fresh.goto('/')
    await offerInstall(fresh)
    const returning = await returningPhone(browser, baseURL!)
    const cart = await returning.newPage()
    await cart.goto('/cart/')
    await offerInstall(cart)
    await page.addInitScript((key) => localStorage.setItem(key, '5'), VISITS_KEY)
    await page.goto('/')
    await offerInstall(page)
    await page.waitForTimeout(1000)
    for (const shown of [fresh, cart, page]) await expect(banner(shown)).toHaveCount(0)
    await first.close()
    await returning.close()
  })

  test('an iPhone’s Safari: how to add it to the home screen', async ({ browser, baseURL }) => {
    const context = await returningPhone(browser, baseURL!, IPHONE_SAFARI)
    const page = await context.newPage()
    await page.goto('/')
    await expect(banner(page)).toContainText('Add to Home Screen')
    await expect(banner(page).getByRole('button', { name: 'نصب' })).toHaveCount(0)
    await banner(page).getByRole('button', { name: 'متوجه شدم' }).click()
    await expect(banner(page)).toHaveCount(0)
    await context.close()
  })
})
