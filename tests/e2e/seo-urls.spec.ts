import { expect, test, type APIRequestContext } from '@playwright/test'
import { existsSync } from 'node:fs'
import { backendLogMode } from './support/backend-log'
import { BACKEND_LOG, fileLog } from './support/cart-write'
import { canonicalsIn, POST_PATH, robotsMetas, saysNoindex } from './support/seo-head'
import { SITEMAP_KINDS, unroutedSitemapPaths } from './support/sitemap-kinds'

// URLs and the SEO edge (Plan 5 Task 7; seo digest §6, §3, §10, §13) on the production build:
// tracking parameters are never filters (no noindex, the canonical leaves them out, the API query
// never carries them); a listing page past its last is a 404 whose API answer is remembered (the
// negative cache: asked again, no API call); a search results page calls the API's `search/`
// exactly once (React `cache()` shares it between the metadata and the page); robots.txt and the
// sitemap come through the shop with the shop's own URLs, each of a kind the shop routes
// (support/sitemap-kinds.ts: an unknown kind fails). The backend's calls are read from its log
// (FIREFLY_BACKEND_LOG, by default /tmp/backend.log): without it those three proofs skip, unless
// `CI` or `E2E_REQUIRE_BACKEND_LOG=1` is set, where they fail (support/backend-log.ts). Read only,
// desktop only.

const CATEGORY = '/product-category/digital/mobile-phone/'
const TRACKING =
  'utm_source=newsletter&utm_medium=email&utm_campaign=fall&gclid=e2e&fbclid=e2e&msclkid=e2e&yclid=e2e&_ga=1.2.3'

const log = fileLog()

/** A proof read from the backend's log: skipped without it, failed when a run requires it. */
function needBackendLog() {
  const mode = backendLogMode({ exists: existsSync(BACKEND_LOG), env: process.env })
  if (mode === 'fail') {
    throw new Error(
      `The backend's log ${BACKEND_LOG} is missing, and CI or E2E_REQUIRE_BACKEND_LOG requires it: ` +
        'start the backend with its output there, or set FIREFLY_BACKEND_LOG.',
    )
  }
  test.skip(mode === 'skip', 'needs the dev backend’s log (FIREFLY_BACKEND_LOG)')
}

/** The backend's request lines written since `offset` that match `pattern`. */
async function backendCalls(offset: number, pattern: RegExp): Promise<string[]> {
  return (await log.since(offset)).split('\n').filter((line) => pattern.test(line))
}

/** Waits until the backend's log stops growing for `pattern` (its lines are written as served). */
async function settledCalls(offset: number, pattern: RegExp): Promise<string[]> {
  let seen = -1
  let lines: string[] = []
  for (let round = 0; round < 10 && lines.length !== seen; round++) {
    seen = lines.length
    await new Promise((resolve) => setTimeout(resolve, 300))
    lines = await backendCalls(offset, pattern)
  }
  return lines
}

async function served(request: APIRequestContext, path: string) {
  const response = await request.get(path, { maxRedirects: 0 })
  return { response, html: await response.text() }
}

test.describe('SEO: URLs', () => {
  test.beforeAll(({}, workerInfo) => {
    test.skip(workerInfo.project.name !== 'desktop', 'one pass a run (desktop project)')
  })

  test('tracking parameters are never filters: indexed as the clean URL', async ({
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin
    for (const [path, clean] of [
      [`${CATEGORY}?${TRACKING}`, CATEGORY],
      ['/brand/samsung/?utm_source=x', '/brand/samsung/'],
      ['/product/list/flagship-phones/?fbclid=x', '/product/list/flagship-phones/'],
      ['/blog/?utm_campaign=x&gclid=y', '/blog/'],
      ['/blog/category/buying-guide/?_ga=1', '/blog/category/buying-guide/'],
      [`${CATEGORY}?page=1&msclkid=x`, CATEGORY],
      // The installed app's start URL (manifest `start_url`) is the home page.
      ['/?source=pwa&utm_source=x', '/'],
    ]) {
      const { response, html } = await served(request, path)
      expect(response.status(), path).toBe(200)
      expect(saysNoindex(response, html), `${path}: indexable`).toBe(false)
      expect(canonicalsIn(html), `${path}: canonical`).toEqual([`${origin}${clean}`])
    }
    // A real filter beside them still makes another page: noindex, no canonical.
    const { response, html } = await served(request, `${CATEGORY}?sort=price-asc&utm_source=x`)
    expect(saysNoindex(response, html)).toBe(true)
    expect(canonicalsIn(html)).toEqual([])
  })

  test('tracking parameters never reach the API query (one cache key)', async ({ request }) => {
    needBackendLog()
    const offset = await log.size()
    // A price bound no other test asks for: a cache miss, so the API is called and logged.
    const bound = 1_000_000 + Math.floor(Math.random() * 1_000_000)
    await served(request, `${CATEGORY}?min_price=${bound}&${TRACKING}`)
    const lines = await settledCalls(
      offset,
      new RegExp(`/api/v1/product/list/\\?[^ ]*min_price=${bound}`),
    )
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).not.toMatch(/utm_|gclid|fbclid|msclkid|yclid|_ga=/)
  })

  test('a listing page past its last: a 404, its API answer remembered a minute', async ({
    request,
  }) => {
    needBackendLog()
    const offset = await log.size()
    const page = 900 + Math.floor(Math.random() * 99)
    for (const path of [`${CATEGORY}?page=${page}`, `${CATEGORY}?page=${page}&utm_source=x`]) {
      const { response, html } = await served(request, path)
      expect(response.status(), path).toBe(404)
      expect(saysNoindex(response, html), path).toBe(true)
    }
    const lines = await settledCalls(
      offset,
      new RegExp(`/api/v1/product/list/\\?[^ ]*page=${page}[& ]`),
    )
    expect(lines, 'the second request (tracking ignored) costs no API call').toHaveLength(1)
    const blog = await served(request, `/blog/?page=${page}`)
    expect(blog.response.status()).toBe(404)
  })

  test('a search results page calls the API’s search/ once', async ({ page }) => {
    needBackendLog()
    const term = 'شیائومی'
    const offset = await log.size()
    const response = await page.goto(`/search/?q=${encodeURIComponent(term)}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Never indexed (seo.spec.ts checks /search/ itself: a second results page would search again).
    expect(robotsMetas((await response?.text()) ?? '').some((c) => /noindex/.test(c))).toBe(true)
    const hits = await settledCalls(
      offset,
      new RegExp(`"GET /api/v1/search/\\?q=${encodeURIComponent(term)}[ &]`),
    )
    expect(hits, 'search/ calls for one results page').toHaveLength(1)
  })

  test('robots.txt and the sitemap: through the shop, with the shop’s URLs, each kind routed', async ({
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin
    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(200)
    expect(robots.headers()['content-type']).toMatch(/^text\/plain/)
    expect(await robots.text()).toMatch(new RegExp(`^Sitemap: ${origin}/sitemap\\.xml$`, 'm'))
    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)
    expect(locs.length).toBeGreaterThan(0)
    for (const loc of locs) expect(new URL(loc).origin, loc).toBe(origin)
    const paths = locs.map((loc) => new URL(loc).pathname)
    // Every <loc> is of a kind the shop routes: a new kind the backend lists fails here.
    expect(unroutedSitemapPaths(paths), 'sitemap paths of no routed kind').toEqual([])
    for (const { name, pattern } of SITEMAP_KINDS.filter((kind) => kind.sample)) {
      const sample = paths.find((path) => pattern.test(path))
      expect(sample, `a sitemap URL of kind ${name}`).toBeDefined()
      expect((await request.get(sample!, { maxRedirects: 0 })).status(), sample).toBe(200)
    }
    // Posts: the one post the SEO spec opens is listed (opening another would count a view).
    expect(paths).toContain(POST_PATH)
    expect(paths.every((path) => path.endsWith('/'))).toBe(true)
    // The contact page's sitemap URL answers 308 to the form's canonical route (ruled in Task 4).
    if (paths.includes('/page/contact-us/')) {
      const contact = await request.get('/page/contact-us/', { maxRedirects: 0 })
      expect(contact.status()).toBe(308)
      expect(contact.headers()['location']).toMatch(/\/contact-us\/$/)
    }
  })
})
