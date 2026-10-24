/**
 * The pages whose URL holds a bearer credential (order digest §1.3, §10): the payment link's
 * token (`/order/pay/<token>/`, the guest's key to pay or cancel the order) and a payment's uuid
 * (`/payment/callback/?payment=<uuid>`, `/payment/card-transfer/<uuid>/`). Anyone who reads such
 * a URL holds the credential, so these pages:
 *
 * - render none of the operator's code (`extra-snippets/`: analytics, chat widgets, trust seals
 *   and the HTML zones alike), since a third-party script there reads the full URL
 *   (`page_location`) — the proxy marks each page it serves (`ROUTE_KIND_HEADER`) and the snippet
 *   loader renders only on a page marked `page` (src/features/settings/operator-code.ts);
 * - send `Referrer-Policy: no-referrer` (security-headers.ts, through next.config.ts), so no
 *   request they make, and no link followed from them, names the URL;
 * - are reached by a full page load from our own pages (a plain `<a>`, `loadPage`), never by
 *   the client router, so a script already running on the page before can never see the URL.
 *
 * A page whose `next` leads back to one (the login the payment link offers for the wallet:
 * `/login/?next=/order/pay/<token>/`) carries the token in its query and is treated the same way.
 * One rule for every consumer; pure: next.config.ts imports it.
 */

/** Each with its trailing slash, the way the site spells its paths. */
export const CREDENTIAL_PREFIXES = ['/order/pay/', '/payment/'] as const

/** The request header the proxy sets on every page it serves (never the visitor's own). */
export const ROUTE_KIND_HEADER = 'x-ff-route-kind'

/**
 * `page`: an ordinary page; `credential`: a page whose URL holds a credential; `offline`: the
 * offline page (`/offline/`), which the service worker keeps and shows in place of a page whose
 * navigation failed, at that page's URL, a credential page's included (src/lib/edge/route-kind.ts).
 * Only `page` carries the operator's code.
 */
export type RouteKind = 'page' | 'credential' | 'offline'

/** Whether `pathname` is one of the credential pages (any letter case: a 404 there counts). */
export function isCredentialPath(pathname: string): boolean {
  const path = (pathname.endsWith('/') ? pathname : `${pathname}/`).toLowerCase()
  return CREDENTIAL_PREFIXES.some((prefix) => path.startsWith(prefix))
}

/** Whether the URL holds a credential: its path, or the page its `next` leads back to. */
export function carriesCredential(url: { pathname: string; searchParams: URLSearchParams }) {
  if (isCredentialPath(url.pathname)) return true
  const next = url.searchParams.get('next')
  return next !== null && next.startsWith('/') && isCredentialPath(next.split(/[?#]/, 1)[0]!)
}

/** The `next` query value of such a URL, as a next.config `has` pattern (anchored there). */
export function credentialQueryValue(): string {
  return `(?:${CREDENTIAL_PREFIXES.join('|')}).*`
}
