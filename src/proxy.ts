import { NextResponse, type NextRequest } from 'next/server'
import { carriesCredential, ROUTE_KIND_HEADER, type RouteKind } from '@/config/credential-routes'
import { getServerEnv, type ServerEnv } from '@/config/env'
import { COOKIE } from '@/lib/auth/cookies'
import { isExpiring } from '@/lib/auth/jwt'
import { refreshAccess } from '@/lib/auth/refresh'
import { CookieJar, readSession } from '@/lib/bff/session'
import { accountLoginPath, isAccountPath } from '@/lib/edge/account-guard'
import { isDecodable, isForwarded, isSkipped } from '@/lib/edge/proxy-paths'
import { knownSources, resolveRedirect, ruleSpelling } from '@/lib/edge/redirects'
import { statusPage } from '@/lib/edge/status-page'
import { getClientIp } from '@/lib/http/client-ip'
import { isQuietPrefetch } from '@/lib/http/prefetch'

/**
 * Runs before every page (Node.js runtime), in this order:
 * 1. `/media/*`, `/static/*` and `/sitemap.xml` are proxied to the Django backend (one that cannot
 *    be percent-decoded answers 404 instead).
 * 2. Next internals, route handlers (`/api/*`, `/s/*`, `/healthz/`) and asset files are left alone
 *    (unmarked: a visitor's own `x-ff-route-kind` is dropped on the way).
 *    Catalog paths are never asset files: one with an extension that cannot be decoded goes on.
 * 3. GET/HEAD: operator redirect rules answer 301/302, or 410 with a status page. Only a path
 *    whose spelling is a known rule source costs an API call (see `redirects.ts`), so a legacy
 *    non-UTF-8 URL an operator redirects still works, and random garbage stays free.
 * 4. A path that cannot be percent-decoded answers 404 (Next would fail on it with a 500).
 * 5. An expiring or missing access token is refreshed, for the browser and for this render.
 * 6. The account area's guard (ruling P3-R3, see `account-guard.ts`): a read of an account page
 *    without a session (no refresh cookie, or one the API has just rejected) is sent to login,
 *    with the page and its query as `next`; leftover session cookies are cleared on the way.
 *
 * Every page that renders is marked for the layouts (`x-ff-route-kind`, never the visitor's own),
 * a prefetch too (it is marked and nothing else: no redirect lookup, no session refresh, no
 * account guard): `credential` when its URL holds a payment link's token or a payment's uuid (or
 * leads back to one), else `page`. Operator code renders only on `page` (see
 * `credential-routes.ts`). A credential page is never looked up as a redirect source: its path
 * never reaches the API's redirect resolver or a log line.
 *
 * The proxy sees the request as the browser sent it (`skipProxyUrlNormalize`, next.config.ts):
 * otherwise Next removes the router's flight headers before it runs, and a router prefetch could
 * not be told from a client navigation (tests/fixtures/rsc-request-shapes.json). So the URL may
 * carry Next's `_rsc`, left out of every URL built here. Redirects are built on the request's
 * own URL (the server's listening address), which Next's router still turns into a relative
 * `Location` with the option on (verified on the build).
 */

const GONE_TITLE = 'این صفحه حذف شده است'
const GONE_MESSAGE = 'این صفحه دیگر وجود ندارد و جایگزینی هم ندارد.'
const NOT_FOUND_TITLE = 'صفحه پیدا نشد'
const NOT_FOUND_MESSAGE = 'نشانی این صفحه درست نیست. آن را بررسی کنید یا از صفحهٔ اصلی ادامه دهید.'

const SESSION_COOKIES = [COOKIE.access, COOKIE.refresh, COOKIE.flag]

/** Proxy to the API host, without the visitor's session cookies or credentials. */
function forward(request: NextRequest, apiUrl: string): NextResponse {
  const { pathname, search } = request.nextUrl
  const headers = new Headers(request.headers)
  headers.delete('cookie')
  headers.delete('authorization')
  return NextResponse.rewrite(new URL(`${apiUrl}${pathname}${search}`), { request: { headers } })
}

async function redirectFor(
  request: NextRequest,
  forwardedFor: string | null,
  decodable: boolean,
): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = request.nextUrl.clone()
  url.searchParams.delete('_rsc')
  // Only listed sources cost an API call. A well-formed path with no local spelling is left to
  // the API; an undecodable one without a spelling is garbage and never reaches it.
  const spelled = ruleSpelling(url.pathname)
  if (spelled === null ? !decodable : !(await knownSources()).has(spelled)) return null

  const rule = await resolveRedirect(url.pathname + url.search, forwardedFor)
  if (rule === null) return null
  if (rule.status === 410) return statusPage(410, GONE_TITLE, GONE_MESSAGE)
  const target = httpUrl(rule.target, request.url)
  if (target === null) {
    console.error('[redirects] unusable target for', url.pathname)
    return null
  }
  return NextResponse.redirect(target, rule.status)
}

/** `target` resolved against the request URL, or null unless it is an http(s) URL. */
function httpUrl(target: string, base: string): URL | null {
  try {
    const url = new URL(target, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** The raw `cookie` header without `drop`, plus `add`. Other cookies are kept byte for byte. */
function cookieHeader(raw: string | null, drop: string[], add: Record<string, string>): string {
  const names = new Set([...drop, ...Object.keys(add)])
  const kept = (raw ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair !== '' && !names.has(pair.split('=', 1)[0]?.trim() ?? ''))
  for (const [name, value] of Object.entries(add)) kept.push(`${name}=${value}`)
  return kept.join('; ')
}

const isSecure = (env: ServerEnv) => new URL(env.SITE_URL).protocol === 'https:'

/** A read of an account page: what the account guard answers (writes are left to the page). */
function isGuarded(request: NextRequest): boolean {
  const { method, nextUrl } = request
  return (method === 'GET' || method === 'HEAD') && isAccountPath(nextUrl.pathname)
}

/** The account guard's answer: login, with the page as `next`; `clear` drops the session cookies. */
function toLogin(request: NextRequest, env: ServerEnv, clear: boolean): NextResponse {
  // `accountLoginPath` leaves Next's `_rsc` out of `next`.
  const response = NextResponse.redirect(new URL(accountLoginPath(request.nextUrl), request.url))
  if (clear) {
    const jar = new CookieJar()
    jar.clearSession()
    jar.applyTo(response, isSecure(env))
  }
  return response
}

/**
 * A path the proxy leaves alone is never marked; a visitor's own marker is dropped on the way,
 * so what renders there (an asset-like URL's 404 page) is unmarked and gets no operator code.
 */
function leftAlone(request: NextRequest): NextResponse {
  if (!request.headers.has(ROUTE_KIND_HEADER)) return NextResponse.next()
  const headers = new Headers(request.headers)
  headers.delete(ROUTE_KIND_HEADER)
  return NextResponse.next({ request: { headers } })
}

/** The request headers the page renders with: the visitor's, with the proxy's own route kind. */
function pageHeaders(request: NextRequest, kind: RouteKind): Headers {
  const headers = new Headers(request.headers)
  headers.set(ROUTE_KIND_HEADER, kind)
  return headers
}

async function withSession(
  request: NextRequest,
  env: ServerEnv,
  forwardedFor: string | null,
  kind: RouteKind,
): Promise<NextResponse> {
  const { access, refresh, marker } = readSession(request)
  const guarded = isGuarded(request)
  const render = () => NextResponse.next({ request: { headers: pageHeaders(request, kind) } })
  if (refresh === null) {
    if (!guarded) return render()
    // A flag or access cookie left behind would show login a session that is not there.
    return toLogin(
      request,
      env,
      SESSION_COOKIES.some((name) => request.cookies.has(name)),
    )
  }
  if (!isExpiring(access)) return render()

  const result = await refreshAccess(refresh, forwardedFor)
  // No answer says nothing about the session: keep the cookies and render.
  if ('error' in result && result.error === 'network') return render()
  if (!('access' in result) && guarded) return toLogin(request, env, true)

  const jar = new CookieJar()
  let cookie: string
  if ('access' in result) {
    // Re-setting the pair keeps the flag alive exactly as long as `ff_rt`, with the session's
    // marker (the same login); a new one when the flag cookie was missing or no marker.
    const kept = jar.setSession(result.access, refresh, marker ?? undefined)
    const add = { [COOKIE.access]: result.access, [COOKIE.flag]: kept }
    cookie = cookieHeader(request.headers.get('cookie'), [], add)
  } else {
    jar.clearSession()
    cookie = cookieHeader(request.headers.get('cookie'), SESSION_COOKIES, {})
  }

  // Server Components read the new cookies from the forwarded request.
  const headers = pageHeaders(request, kind)
  if (cookie) headers.set('cookie', cookie)
  else headers.delete('cookie')
  const response = NextResponse.next({ request: { headers } })
  jar.applyTo(response, isSecure(env))
  return response
}

const notFoundPage = () => statusPage(404, NOT_FOUND_TITLE, NOT_FOUND_MESSAGE)

export async function proxy(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl
  const decodable = isDecodable(pathname)
  // Forwarded paths come first: `/media/a.png` also looks like an asset file.
  if (isForwarded(pathname)) {
    return decodable ? forward(request, getServerEnv().FIREFLY_API_URL) : notFoundPage()
  }
  // Skipped paths never read the environment, so the health probe reports a broken one itself.
  if (isSkipped(pathname, decodable)) return leftAlone(request)

  const kind: RouteKind = carriesCredential(request.nextUrl) ? 'credential' : 'page'
  // A prefetch is marked like the visit (a kept document is shown on the click, and the snippet
  // gate fails closed) and nothing more: no redirect lookup (it would count a hit), no refresh.
  if (isQuietPrefetch(request.headers)) {
    if (!decodable) return notFoundPage()
    return NextResponse.next({ request: { headers: pageHeaders(request, kind) } })
  }

  const env = getServerEnv()
  const forwardedFor = getClientIp(request.headers, env.CLIENT_IP_HEADER)
  const redirect = kind === 'page' ? await redirectFor(request, forwardedFor, decodable) : null
  if (redirect !== null) return redirect
  // No route can read it: no session refresh either.
  if (!decodable) return notFoundPage()
  return withSession(request, env, forwardedFor, kind)
}

// Next reads `config` statically at build time: literals only, no shared constants.
export const config = {
  matcher: [
    {
      // Pages only: no Next internals, route handlers, robots.txt, the health check, icons or
      // asset files (`.xml` and legacy page extensions are kept, as in ASSET_FILE). Prefetches
      // too: each render is marked with its route kind, and nothing else (`isQuietPrefetch`).
      source:
        '/((?!_next/|api/|s/|icons/|favicon\\.ico|robots\\.txt|healthz/?$|.*\\.(?!xml$|html?$|php$|aspx?$)[^/.]+$).*)',
    },
    {
      // Catalog paths with an extension too (`/product/x%ZZ.png`): no file lives there, and an
      // undecodable one must reach the 404 guard instead of failing in Next with a 500.
      source: '/(product-category|brand|product)/:path*',
    },
    '/media/:path*',
    '/static/:path*',
    '/sitemap.xml',
  ],
}
