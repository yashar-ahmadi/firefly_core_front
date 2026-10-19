import { expect, type APIResponse, type Page } from '@playwright/test'

// What the SEO specs read of a page (tests/e2e/seo*.spec.ts): its head and structured data as the
// server sent them (crawlers read the HTML first), and the DOM after hydration.

/**
 * The one blog post the SEO specs open (route-table.spec.ts reads the same one): each GET of a
 * post counts a view (ruling P5-R1), so no spec here opens another.
 */
export const POST_PATH = '/blog/best-phones-under-30m/'

/** Every `@type` in a parsed JSON-LD value: its own, an array's items' and a `@graph`'s. */
export function typesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(typesIn)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const own = record['@type']
  const types = typeof own === 'string' ? [own] : Array.isArray(own) ? own.map(String) : []
  return [...types, ...typesIn(record['@graph'])]
}

/** The page's JSON-LD blocks, each parsed with `JSON.parse` (one that does not parse fails). */
export async function jsonLdOf(page: Page): Promise<unknown[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  return blocks.map((block, index) => {
    try {
      return JSON.parse(block) as unknown
    } catch (error) {
      throw new Error(`JSON-LD block ${index} does not parse: ${String(error)}\n${block}`)
    }
  })
}

/** The `content` of each `<meta name="robots">` in the served HTML. */
export function robotsMetas(html: string): string[] {
  return [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((match) => match[1]!)
}

/** Whether a response says noindex: a robots meta tag, or the `X-Robots-Tag` header. */
export function saysNoindex(response: APIResponse, html: string): boolean {
  const header = response.headers()['x-robots-tag'] ?? ''
  return /noindex/i.test(header) || robotsMetas(html).some((content) => /noindex/i.test(content))
}

/** The canonical links in the served HTML. */
export function canonicalsIn(html: string): string[] {
  return [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((match) =>
    match[1]!.replaceAll('&amp;', '&'),
  )
}

/** How many `<h1>` the served HTML has (before any script runs). */
export function h1CountIn(html: string): number {
  return (html.match(/<h1[\s>]/g) ?? []).length
}

/**
 * The page's one canonical: absolute, on the shop's own origin (`origin`), ending with `/`.
 * Returns its path.
 */
export async function expectCanonical(page: Page, origin: string, label: string): Promise<string> {
  const links = page.locator('link[rel="canonical"]')
  await expect(links, `${label}: one canonical`).toHaveCount(1)
  const href = (await links.getAttribute('href')) ?? ''
  expect(href, `${label}: absolute`).toMatch(/^https?:\/\//)
  const url = new URL(href)
  expect(url.origin, `${label}: on the shop's origin`).toBe(origin)
  expect(href, `${label}: ends with /`).toMatch(/\/$/)
  return url.pathname
}
