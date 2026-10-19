// A page's canonical URL from the operator's `canonical_link` (seo digest §7.1). Pure.

/** A path's trailing slash (the site's URLs all have one: `trailingSlash`), query and hash kept. */
function withSlash(path: string): string {
  const [, pathname = '', rest = ''] = /^([^?#]*)(.*)$/.exec(path) ?? []
  return pathname.endsWith('/') ? path : `${pathname}/${rest}`
}

/**
 * The canonical: the operator's `link` (a path or a URL on this shop, given its trailing slash;
 * another site's as written), else the page's own path (resolved on the layout's
 * `metadataBase`, the storefront's origin).
 */
export function canonicalFor(
  link: string | null | undefined,
  ownPath: string,
  siteUrl: string,
): string {
  const given = link?.trim()
  if (!given) return ownPath
  if (given.startsWith('/') && !given.startsWith('//')) return withSlash(given)
  try {
    const url = new URL(given)
    if (url.origin !== new URL(siteUrl).origin) return given
    return `${url.origin}${withSlash(`${url.pathname}${url.search}${url.hash}`)}`
  } catch {
    return given
  }
}
