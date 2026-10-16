import type { NextRequest } from 'next/server'
import { handleBff } from '@/lib/bff/handler'

/**
 * Backend-for-frontend: the browser's only way to reach the Firefly API.
 *
 * - Forwards allow-listed paths (`@/lib/bff/allowlist`) with the server-only API key, the visitor
 *   IP, `Idempotency-Key`, the bearer from `ff_at` and, for guests, `X-Cart-Token` from `ff_cart`.
 * - Every request needs `X-Requested-With: ff`; writes also need a same-origin `Origin`.
 * - Keeps JWTs and the guest cart token in httpOnly cookies and strips them from every body.
 * - Refreshes the access token at most once per request.
 * - Answers with the API's status, JSON envelope and `Retry-After`; never with its cookies.
 * - Answers a guest's `GET cart/` (no cart or session cookie) from a shared copy of the empty
 *   cart, refreshed every 60 s (`@/lib/bff/guest-cart`).
 */
export const dynamic = 'force-dynamic'

interface Context {
  params: Promise<{ path: string[] }>
}

async function handle(req: NextRequest, { params }: Context) {
  const { path } = await params
  return handleBff(req, path)
}

export { handle as DELETE, handle as GET, handle as PATCH, handle as POST, handle as PUT }
