import type { NextRequest } from 'next/server'
import { COOKIE } from '@/lib/auth/cookies'
import { CookieJar, captureSession } from '@/lib/bff/session'
import { callUpstream } from '@/lib/bff/upstream'

// A guest with no cart cookie and no session always gets the API's empty cart from `GET cart/`.
// The header badge asks for it on every page view, so the BFF keeps one copy of that answer in
// memory (per server process) and serves it for up to TTL_MS instead of calling the API each time.

export const GUEST_CART_PATH = 'cart/'
export const GUEST_CART_TTL_MS = 60_000
const FILL_TIMEOUT_MS = 5_000

/** Cookies that make a `GET cart/` personal: any of them, even malformed, skips the copy. */
const PERSONAL_COOKIES = [COOKIE.cart, COOKIE.access, COOKIE.refresh, COOKIE.flag] as const

interface Copy {
  /** The response body, stripped as every cart answer is (`captureSession`). */
  readonly text: string
  readonly at: number
}

let copy: Copy | null = null
let filling: Promise<Copy | null> | null = null

/**
 * Whether this request may be answered from the shared copy: a `GET` of exactly `cart/` with no
 * query string and none of our session or cart cookies. Decided before any refresh step.
 */
export function isAnonymousCartRead(req: NextRequest, method: string, path: string): boolean {
  if (method !== 'GET' || path !== GUEST_CART_PATH) return false
  if (req.nextUrl.search !== '' || req.url.includes('?')) return false
  return PERSONAL_COOKIES.every((name) => !req.cookies.has(name))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Only an empty, tokenless guest cart may be shared. */
function isEmptyGuestCart(data: unknown): boolean {
  if (!isRecord(data)) return false
  const lines = data.lines
  const noLines = lines === undefined || (Array.isArray(lines) && lines.length === 0)
  const noToken = data.token === undefined || data.token === ''
  return data.is_empty === true && data.item_count === 0 && noLines && noToken
}

async function fill(apiUrl: string, apiKey: string): Promise<Copy | null> {
  // No X-Cart-Token, no Authorization, no visitor IP: the answer is the same for every guest.
  const headers = new Headers({ Accept: 'application/json' })
  if (apiKey) headers.set('X-API-Key', apiKey)
  const result = await callUpstream(`${apiUrl}/api/v1/${GUEST_CART_PATH}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(FILL_TIMEOUT_MS),
  })
  if (result.kind !== 'json' || result.status !== 200 || !isEmptyGuestCart(result.body.data)) {
    return null
  }
  const body = result.body
  const jar = new CookieJar()
  captureSession(
    { path: GUEST_CART_PATH, status: 200, body, sentAccess: false, sentCart: false },
    jar,
  )
  return { text: JSON.stringify(body), at: Date.now() }
}

/**
 * The shared empty-cart body, or null when the API did not give a shareable one (an error, a
 * non-empty cart, a token): the caller then proxies the request as usual. Concurrent misses
 * share one upstream call; nothing but a valid empty cart is ever stored.
 */
export async function anonymousCartBody(apiUrl: string, apiKey: string): Promise<string | null> {
  if (copy && Date.now() - copy.at < GUEST_CART_TTL_MS) return copy.text
  copy = null
  filling ??= fill(apiUrl, apiKey)
    .catch(() => null)
    .then((next) => {
      copy = next
      filling = null
      return next
    })
  return (await filling)?.text ?? null
}
