import { asParsed, isRootPath } from '@/lib/links/as-parsed'

/**
 * Operator links (menus, homepage sections, rich content) are a `/…` storefront path or an
 * absolute URL. Pure helpers shared by MenuLink, StoreLink and RichContent. Each reads the URL as
 * the browser's URL parser does (as-parsed.ts): `/<tab>/host` is `//host`, another host.
 */

/**
 * The href for an operator URL, as the browser reads it. An absolute URL on the shop's own origin
 * (an operator may paste one) becomes a path, so it routes on the client; anything else is kept.
 */
export function storeHref(url: string, siteUrl: string | undefined): string {
  const href = asParsed(url)
  if (href.startsWith('/') || !siteUrl) return href
  try {
    const target = new URL(href)
    if (target.origin !== new URL(siteUrl).origin) return href
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return href
  }
}

/**
 * Whether `href` is a root-relative storefront path as the browser reads it. `//host` and
 * `/\host` are not (nor `/<tab>/host`): browsers read them as protocol-relative URLs to another
 * host.
 */
export function isStorePath(href: string): boolean {
  return isRootPath(href)
}
