import { NextResponse, type NextRequest } from 'next/server'
import { getServerEnv, type ServerEnv } from '@/config/env'
import { COOKIE } from '@/lib/auth/cookies'
import { isExpiring } from '@/lib/auth/jwt'
import { refreshAccess } from '@/lib/auth/refresh'
import { CookieJar, readSession } from '@/lib/bff/session'
import { knownSources, resolveRedirect, ruleSpelling } from '@/lib/edge/redirects'
import { statusPage } from '@/lib/edge/status-page'
import { getClientIp } from '@/lib/http/client-ip'

/**
 * Runs before every page (Node.js runtime), in this order:
 * 0. A path that cannot be percent-decoded answers 404 (Next would fail on it with a 500).
 * 1. `/media/*`, `/static/*` and `/sitemap.xml` are proxied to the Django backend.
 * 2. Next internals, route handlers (`/api/*`, `/s/*`, `/healthz/`) and asset files are left alone.
 * 3. GET/HEAD: operator redirect rules answer 301/302, or 410 with a status page.
 * 4. An expiring or missing access token is refreshed, for the browser and for this render.
 */

const GONE_TITLE = 'این صفحه حذف شده است'
const GONE_MESSAGE = 'این صفحه دیگر وجود ندارد و جایگزینی هم ندارد.'
const NOT_FOUND_TITLE = 'صفحه پیدا نشد'
const NOT_FOUND_MESSAGE = 'نشانی این صفحه درست نیست. آن را بررسی کنید یا از صفحهٔ اصلی ادامه دهید.'

const SESSION_COOKIES = [COOKIE.access, COOKIE.refresh, COOKIE.flag]
const SKIPPED_PREFIX = /^\/(?:_next|api|s|icons)\//
/** The health probe (src/app/healthz): never a redirect lookup or a session refresh. */
const HEALTH_CHECK = /^\/healthz\/?$/
/**
 * The last segment has a file extension, other than `.xml` and the legacy page extensions that
 * operators may redirect from older platforms (`.html`, `.htm`, `.php`, `.asp`, `.aspx`).
 */
const ASSET_FILE = /\/[^/]*\.(?!xml$|html?$|php$|aspx?$)[^/.]+$/

/** Whether every `%` in the path starts a valid UTF-8 escape (`%ZZ` or a cut `%E0%A4%A` do not). */
function isDecodable(pathname: string): boolean {
  try {
    decodeURIComponent(pathname)
    return true
  } catch {
    return false
  }
}

function isForwarded(pathname: string): boolean {
  return pathname === '/sitemap.xml' || /^\/(?:media|static)\//.test(pathname)
}

function isSkipped(pathname: string): boolean {
  return SKIPPED_PREFIX.test(pathname) || HEALTH_CHECK.test(pathname) || ASSET_FILE.test(pathname)
}

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
): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  if (request.headers.get('purpose') === 'prefetch') return null
  const url = request.nextUrl.clone()
  url.searchParams.delete('_rsc')
  // Only listed sources cost an API call; a path with no local spelling is left to the API.
  const spelled = ruleSpelling(url.pathname)
  if (spelled !== null && !(await knownSources()).has(spelled)) return null

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

async function withSession(
  request: NextRequest,
  env: ServerEnv,
  forwardedFor: string | null,
): Promise<NextResponse> {
  const { access, refresh } = readSession(request)
  if (refresh === null || !isExpiring(access)) return NextResponse.next()

  const result = await refreshAccess(refresh, forwardedFor)
  // No answer says nothing about the session: keep the cookies and render.
  if ('error' in result && result.error === 'network') return NextResponse.next()

  const jar = new CookieJar()
  let cookie: string
  if ('access' in result) {
    // Re-setting the pair keeps `ff_auth=1` alive exactly as long as `ff_rt`.
    jar.setSession(result.access, refresh)
    const add = { [COOKIE.access]: result.access, [COOKIE.flag]: '1' }
    cookie = cookieHeader(request.headers.get('cookie'), [], add)
  } else {
    jar.clearSession()
    cookie = cookieHeader(request.headers.get('cookie'), SESSION_COOKIES, {})
  }

  // Server Components read the new cookies from the forwarded request.
  const headers = new Headers(request.headers)
  if (cookie) headers.set('cookie', cookie)
  else headers.delete('cookie')
  const response = NextResponse.next({ request: { headers } })
  jar.applyTo(response, new URL(env.SITE_URL).protocol === 'https:')
  return response
}

export async function proxy(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl
  // Before anything else: no API call, no session refresh for a path no route can read.
  if (!isDecodable(pathname)) return statusPage(404, NOT_FOUND_TITLE, NOT_FOUND_MESSAGE)
  // Forwarded paths come first: `/media/a.png` also looks like an asset file.
  if (isForwarded(pathname)) return forward(request, getServerEnv().FIREFLY_API_URL)
  // Skipped paths never read the environment, so the health probe reports a broken one itself.
  if (isSkipped(pathname)) return NextResponse.next()

  const env = getServerEnv()
  const forwardedFor = getClientIp(request.headers, env.CLIENT_IP_HEADER)
  const redirect = await redirectFor(request, forwardedFor)
  if (redirect !== null) return redirect
  return withSession(request, env, forwardedFor)
}

export const config = {
  matcher: [
    {
      // Pages only: no Next internals, route handlers, robots.txt, the health check, icons or
      // asset files (`.xml` and legacy page extensions are kept, as in ASSET_FILE). Prefetches
      // skip the proxy so they never count a redirect hit.
      source:
        '/((?!_next/|api/|s/|icons/|favicon\\.ico|robots\\.txt|healthz/?$|.*\\.(?!xml$|html?$|php$|aspx?$)[^/.]+$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    '/media/:path*',
    '/static/:path*',
    '/sitemap.xml',
  ],
}
