import { expect, type BrowserContext, type Page } from '@playwright/test'

// The PWA specs' tools (tests/e2e/pwa*.spec.ts, the `pwa` project, FEATURE_PWA on).

/** The main server's base URL: FEATURE_PWA off there (playwright.config.ts). */
export const MAIN_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/**
 * Waits until the service worker controls the page: registered after `load` and idle, installed
 * (the offline page and the home page's copy kept first), active and claiming the page.
 */
export async function controlled(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 20_000,
  })
}

/** What the worker keeps, by cache: the paths stored in each. */
export function kept(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {}
    for (const name of await caches.keys()) {
      const requests = await (await caches.open(name)).keys()
      out[name] = requests.map((request) => new URL(request.url).pathname)
    }
    return out
  })
}

/** The kept pages (`ff-<build>-pages`), in the order kept. */
export async function keptPages(page: Page): Promise<string[]> {
  const caches = await kept(page)
  const name = Object.keys(caches).find((key) => /^ff-.+-pages$/.test(key))
  expect(name, 'the pages cache').toBeDefined()
  return caches[name!]!
}

/** The kept copy of `path`'s HTML. */
export function keptHtml(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (at) => {
    const response = await caches.match(at)
    return response ? response.text() : null
  }, path)
}

/**
 * The device offline. Playwright's offline mode cuts the pages' requests but not the service
 * worker's own fetches (Chromium; seen on this build: an unvisited page still loaded through the
 * worker), so every request the context makes, the worker's included, fails as without a network.
 */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true)
  await context.route('**/*', (route) => route.abort('internetdisconnected'))
}

export async function goOnline(context: BrowserContext): Promise<void> {
  await context.unrouteAll({ behavior: 'ignoreErrors' })
  await context.setOffline(false)
}

export const OFFLINE_TITLE = 'اتصال اینترنت برقرار نیست'
