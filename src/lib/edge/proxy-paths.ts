// The paths the proxy (src/proxy.ts) treats apart, by their shape alone. Pure.

const SKIPPED_PREFIX = /^\/(?:_next|api|s|icons)\//
/** The health probe (src/app/healthz): never a redirect lookup or a session refresh. */
const HEALTH_CHECK = /^\/healthz\/?$/
/**
 * The last segment has a file extension, other than `.xml` and the legacy page extensions that
 * operators may redirect from older platforms (`.html`, `.htm`, `.php`, `.asp`, `.aspx`), in any
 * letter case (`/Index.PHP`). The proxy's matcher spells the same rule out letter by letter.
 */
const ASSET_FILE = /\/[^/]*\.(?!xml$|html?$|php$|aspx?$)[^/.]+$/i

/** Whether every `%` in the path starts a valid UTF-8 escape (`%ZZ` or a cut `%E0%A4%A` do not). */
export function isDecodable(pathname: string): boolean {
  try {
    decodeURIComponent(pathname)
    return true
  } catch {
    return false
  }
}

/** `/media/*`, `/static/*` and `/sitemap.xml`: proxied to the Django backend. */
export function isForwarded(pathname: string): boolean {
  return pathname === '/sitemap.xml' || /^\/(?:media|static)\//.test(pathname)
}

/** Catalog routes, which never serve files (the matcher sends extension-bearing ones here too). */
const CATALOG_PATH = /^\/(?:product-category|brand|product)\//
/**
 * The blog's routes (`blog-gate.ts`'s `isBlogPath`): no file lives there either, so a slug that
 * looks like one (`/blog/guide.png`) is a page, and gets the blog switch's 503 like the others.
 */
const BLOG_PATH = /^\/blog(?:\/|$)/

/** Next internals, route handlers, the health check and asset files: left alone. */
export function isSkipped(pathname: string, decodable: boolean): boolean {
  if (SKIPPED_PREFIX.test(pathname) || HEALTH_CHECK.test(pathname)) return true
  if (BLOG_PATH.test(pathname)) return false
  // An undecodable catalog path is a page URL gone wrong: it goes on to the 404 guard.
  return ASSET_FILE.test(pathname) && (decodable || !CATALOG_PATH.test(pathname))
}
