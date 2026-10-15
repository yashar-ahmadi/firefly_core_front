import type { NextRequest } from 'next/server'
import { getServerEnv } from '@/config/env'
import { statusPage } from '@/lib/edge/status-page'
import { getClientIp } from '@/lib/http/client-ip'

/**
 * The bank's return URL (`STOREFRONT_URL + /api/v1/payment/gateway/callback/<gateway>/<token>/`).
 * GET and POST are forwarded to Django unchanged — query, raw body, `Content-Type`, visitor IP,
 * trailing slash — and its answer (a 302 to the payment result page) is relayed as is. The view
 * is outside the API-key gate, so no key is sent. Lives outside `/api/bff`.
 */
export const dynamic = 'force-dynamic'

/** Bank callbacks are small form posts. */
const MAX_BODY_BYTES = 64 * 1024
/** Django verifies the payment with the bank before it answers. */
const TIMEOUT_MS = 30_000
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

interface Context {
  params: Promise<{ gateway: string; token: string }>
}

/** The URL segment, or null for one that would move the URL out of the callback path. */
function segment(value: string): string | null {
  return value === '' || value === '.' || value === '..' ? null : encodeURIComponent(value)
}

/** The whole body, or null once it passes `limit` bytes. */
async function readCapped(
  req: NextRequest,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const chunks: Uint8Array[] = []
  let total = 0
  if (req.body) {
    const reader = req.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function handle(req: NextRequest, { params }: Context): Promise<Response> {
  const { gateway, token } = await params
  const gatewaySegment = segment(gateway)
  const tokenSegment = segment(token)
  if (gatewaySegment === null || tokenSegment === null) return new Response(null, { status: 404 })

  let body: Uint8Array<ArrayBuffer> | undefined
  if (req.method === 'POST') {
    const read = await readCapped(req, MAX_BODY_BYTES)
    if (read === null) return new Response(null, { status: 413 })
    body = read
  }

  const env = getServerEnv()
  const headers = new Headers()
  const contentType = req.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)
  const forwardedFor = getClientIp(req.headers, env.CLIENT_IP_HEADER)
  if (forwardedFor) headers.set('X-Forwarded-For', forwardedFor)

  const path = `/api/v1/payment/gateway/callback/${gatewaySegment}/${tokenSegment}/`
  let upstream: Response
  try {
    upstream = await fetch(`${env.FIREFLY_API_URL}${path}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    console.error('[payment-callback] backend unreachable', error)
    // The payment still settles: the backend reconciles open payments with the bank.
    return statusPage(
      503,
      'لحظه\u{200C}ای بعد دوباره امتحان کنید',
      'نتیجه\u{0654} پرداخت الان ثبت نشد. اگر مبلغی از حساب شما کم شده، وضعیت سفارش تا چند دقیقه دیگر به\u{200C}روز می\u{200C}شود.',
    )
  }

  const out = new Headers({ 'Cache-Control': 'no-store' })
  for (const name of ['location', 'content-type']) {
    const value = upstream.headers.get(name)
    if (value) out.set(name, value)
  }
  const relayBody = NULL_BODY_STATUSES.has(upstream.status) ? null : upstream.body
  return new Response(relayBody, { status: upstream.status, headers: out })
}

export { handle as GET, handle as POST }
