import { expect, test } from '@playwright/test'
import { signedInTest } from './support/session'
import {
  controlled,
  goOffline,
  goOnline,
  kept,
  keptHtml,
  keptPages,
  MAIN_BASE_URL,
  OFFLINE_TITLE,
} from './support/pwa'
import { watchErrors } from './support/watch-errors'

// The installable PWA (Plan 5 Task 6) on the production build, FEATURE_PWA on (the push shop's
// server: the one worker shows pushes and caches): the manifest and its icons, the worker's
// registration, and offline: the home page from the anonymous copy kept, any other page the
// offline page, never a copy of a visitor's own page (Review Focus #3).

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'

/** A PNG's width and height, from its IHDR chunk. */
const pngSize = (bytes: Buffer) => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]

test.describe('the manifest and the worker', () => {
  test('/manifest.webmanifest: JSON with the store’s name, Persian, its start page and icons', async ({
    request,
  }) => {
    const settings = await (await request.get(`${API_URL}/api/v1/global/settings/`)).json()
    const response = await request.get('/manifest.webmanifest')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/manifest+json')
    const manifest = JSON.parse(await response.text())
    expect(manifest).toMatchObject({
      name: settings.data.name,
      lang: 'fa',
      dir: 'rtl',
      display: 'standalone',
      start_url: '/?source=pwa',
      scope: '/',
      background_color: '#ffffff',
    })
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url)).toEqual([
      '/search/',
      '/cart/',
      '/account/orders/',
    ])
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const png = await request.get(icon.src)
      expect(png.headers()['content-type'], icon.src).toBe('image/png')
      expect(pngSize(await png.body()).join('x'), icon.src).toBe(icon.sizes)
    }
    expect((await request.get('/icons/1024/')).status()).toBe(404)
  })

  test('the start page’s ?source=pwa makes no second page: its canonical is /', async ({
    request,
  }) => {
    const html = await (await request.get('/?source=pwa')).text()
    expect(/<link rel="canonical" href="([^"]+)"/.exec(html)?.[1]).toMatch(/^https?:\/\/[^/]+\/$/)
  })

  test('/sw.js: offline caching here, push only where FEATURE_PWA is off', async ({ request }) => {
    const here = await request.get('/sw.js')
    expect(here.headers()).toMatchObject({
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    })
    const source = await here.text()
    expect(source).toContain("self.addEventListener('fetch'")
    expect(source).toContain("self.addEventListener('push'")
    const off = await (await request.get(`${MAIN_BASE_URL}/sw.js`)).text()
    expect(off).not.toContain("self.addEventListener('fetch'")
    expect(off).toContain("self.addEventListener('push'")
  })

  test('registers after load, for the whole site; keeps only the offline page and the home page', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto('/product/samsung-galaxy-s25-ultra/')
    await controlled(page)
    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready
      // Web push registers the same script for the same scope: still the one registration.
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      return {
        scope: ready.scope,
        script: ready.active?.scriptURL,
        count: (await navigator.serviceWorker.getRegistrations()).length,
      }
    })
    expect(registration.scope).toBe(new URL('/', page.url()).href)
    expect(new URL(registration.script!).pathname).toBe('/sw.js')
    expect(registration.count).toBe(1)
    await page.goto('/cart/')
    await page.goto('/blog/')
    expect(await keptPages(page)).toEqual(['/offline/', '/'])
    const files = Object.entries(await kept(page)).find(([name]) => name.endsWith('-static'))
    expect(files?.[1].some((path) => path.endsWith('.css'))).toBe(true)
    expect(errors).toEqual([])
  })
})

test.describe('offline', () => {
  test('after a visit, the home page still renders offline, at its start URL too', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await controlled(page)
    const title = await page.title()
    await goOffline(context)
    for (const path of ['/', '/?source=pwa']) {
      await page.goto(path)
      await expect(page).toHaveTitle(title)
      await expect(page.getByRole('heading', { level: 1, name: OFFLINE_TITLE })).toHaveCount(0)
      await expect(page.locator('header').getByRole('link').first()).toBeVisible()
    }
    await goOnline(context)
  })

  test('a page never visited: «اتصال اینترنت برقرار نیست»; the retry loads it once online', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await controlled(page)
    await goOffline(context)
    await page.goto('/product/samsung-galaxy-s25-ultra/')
    await expect(page.getByRole('heading', { level: 1, name: OFFLINE_TITLE })).toBeVisible()
    await expect(page).toHaveURL(/\/product\/samsung-galaxy-s25-ultra\/$/)
    await goOnline(context)
    await page.getByRole('button', { name: 'تلاش دوباره' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('S25')
  })

  test('the cart, the checkout and an account page offline: the offline page, never a copy', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await controlled(page)
    // Seen online first: had the worker kept them, this is where it would show them.
    for (const path of ['/cart/', '/checkout/', '/account/']) await page.goto(path)
    expect(await keptPages(page)).toEqual(['/offline/', '/'])
    await goOffline(context)
    for (const path of ['/cart/', '/checkout/', '/account/orders/']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: OFFLINE_TITLE }), path).toBeVisible()
    }
    await goOnline(context)
  })
})

signedInTest.describe('offline, signed in', () => {
  signedInTest(
    'the copy kept of the home page has nothing of the visitor’s',
    async ({ page, context }) => {
      await page.goto('/account/orders/')
      await controlled(page)
      await page.goto('/')
      await expect(page.locator('header')).toBeVisible()
      expect(await keptPages(page)).toEqual(['/offline/', '/'])
      const copy = await keptHtml(page, '/')
      expect(copy).toContain('hasSession\\":false')
      expect(copy).not.toContain('سارا')
      await goOffline(context)
      await page.goto('/account/orders/')
      await expect(page.getByRole('heading', { level: 1, name: OFFLINE_TITLE })).toBeVisible()
      await goOnline(context)
    },
  )
})
