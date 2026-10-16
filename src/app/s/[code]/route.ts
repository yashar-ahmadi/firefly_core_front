import { NextResponse, type NextRequest } from 'next/server'
import { getServerEnv } from '@/config/env'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import { statusPage } from '@/lib/edge/status-page'
import { getClientIp } from '@/lib/http/client-ip'
import { isPrefetchRequest } from '@/lib/http/prefetch'

/**
 * Short links (`/s/<code>`, printed on SMS and QR campaigns). Every API 200 counts a visit, so
 * the answer is always a fresh 302: a 301 would be cached by the browser, uncounted, and could
 * never show "campaign ended". Panel URLs have no trailing slash: one 308 hop comes first.
 * A prefetch (Next router or browser speculation) is not a visit: an uncached 204, no API call.
 */
export const dynamic = 'force-dynamic'

/** The API's code alphabet (stored lower-case, looked up case-insensitively). */
const CODE = /^[A-Za-z0-9_-]{3,50}$/
const TIMEOUT_MS = 3_000

const notFound = () => statusPage(404, 'این لینک پیدا نشد', 'لینک کوتاهی با این نشانی وجود ندارد.')
const expired = () => statusPage(410, 'این کمپین تمام شده', 'مهلت این لینک به پایان رسیده است.')
const unavailable = () =>
  statusPage(503, 'لحظه\u{200C}ای بعد دوباره امتحان کنید', 'این لینک الان در دسترس نیست.')

function httpUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

interface Context {
  params: Promise<{ code: string }>
}

export async function GET(req: NextRequest, { params }: Context): Promise<Response> {
  if (isPrefetchRequest(req.headers)) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }
  const { code } = await params
  if (!CODE.test(code)) return notFound()

  const env = getServerEnv()
  try {
    const { data } = await apiFetch<{ target_url?: unknown } | null>(`shortener/${code}`, {
      forwardedFor: getClientIp(req.headers, env.CLIENT_IP_HEADER),
      timeoutMs: TIMEOUT_MS,
    })
    const target = httpUrl(data?.target_url)
    if (target !== null) {
      const res = NextResponse.redirect(target, 302)
      res.headers.set('Cache-Control', 'no-store')
      return res
    }
    console.error('[short-link] unusable target for', code)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'short_link_expired') return expired()
    if (error instanceof ApiError && error.code === 'short_link_not_found') return notFound()
    const reason = error instanceof ApiError ? `${error.status} ${error.code}` : error
    console.error('[short-link] shortener answered', reason)
  }
  return unavailable()
}
