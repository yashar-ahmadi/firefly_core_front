/**
 * Storefront short links (`/s/<code>`, src/app/s/[code]) count a visit on every request, so a link
 * to one inside the storefront must be a plain `<a>`: never a Next `Link`, which would prefetch it
 * (one counted "visit" per page view). Used by MenuLink and by Plan 2's StoreLink. Pure.
 */

/** True for a root-relative href on the short-link route: `/s`, `/s/<code>`, with any query. */
export function isShortLinkPath(href: string): boolean {
  return /^\/s(?:[/?#]|$)/.test(href)
}
