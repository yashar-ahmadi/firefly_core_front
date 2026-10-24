// The kinds of URL the backend's sitemap lists, each one a route of the shop (Plan 5 Task 7; the
// unrouted-pattern check carried from its review). tests/e2e/seo-urls.spec.ts fails on any <loc>
// path of no kind here: a new kind the backend lists must be routed (and added here) first.
// Pure, so the unit tests check the patterns themselves (tests/unit/e2e-support/).

export interface SitemapKind {
  name: string
  pattern: RegExp
  /** Whether the spec opens one sample of it for a 200 (posts count a view: P5-R1). */
  sample: boolean
}

export const SITEMAP_KINDS: readonly SitemapKind[] = [
  { name: 'product', pattern: /^\/product\/(?!list\/)[^/]+\/$/, sample: true },
  { name: 'category', pattern: /^\/product-category\/(?:[^/]+\/)+$/, sample: true },
  { name: 'brand', pattern: /^\/brand\/[^/]+\/$/, sample: true },
  { name: 'list', pattern: /^\/product\/list\/[^/]+\/$/, sample: true },
  { name: 'blog category', pattern: /^\/blog\/category\/(?:[^/]+\/)+$/, sample: true },
  { name: 'page', pattern: /^\/page\/(?!contact-us\/)[^/]+\/$/, sample: true },
  // Answers 308 to the form's canonical route `/contact-us/` (ruled in Task 4).
  { name: 'contact page', pattern: /^\/page\/contact-us\/$/, sample: false },
  // Only POST_PATH is opened (seo-urls.spec.ts asserts it is listed).
  { name: 'post', pattern: /^\/blog\/(?!category\/)[^/]+\/$/, sample: false },
]

/** The kind of a sitemap path, or undefined when no route of the shop answers it. */
export function sitemapKind(path: string): string | undefined {
  return SITEMAP_KINDS.find((kind) => kind.pattern.test(path))?.name
}

/** The paths of `paths` that are of no kind. */
export function unroutedSitemapPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => sitemapKind(path) === undefined)
}
