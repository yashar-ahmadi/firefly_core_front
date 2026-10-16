/**
 * Operator links (menus, homepage sections, rich content) are a `/…` storefront path or an
 * absolute URL. Pure helpers shared by MenuLink, StoreLink and RichContent.
 */

/**
 * The href for an operator URL. An absolute URL on the shop's own origin (an operator may paste
 * one) becomes a path, so it routes on the client; anything else is kept as typed.
 */
export function storeHref(url: string, siteUrl: string | undefined): string {
  if (url.startsWith('/') || !siteUrl) return url
  try {
    const target = new URL(url)
    if (target.origin !== new URL(siteUrl).origin) return url
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return url
  }
}

/**
 * Whether `href` is a root-relative storefront path. `//host` and `/\host` are not: browsers
 * read both as protocol-relative URLs to another host.
 */
export function isStorePath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')
}
