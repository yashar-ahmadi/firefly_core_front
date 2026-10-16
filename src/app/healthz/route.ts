/**
 * Liveness probe for the container healthcheck and load balancers (`/healthz/`). It answers on
 * its own: no API call, no settings, no environment, no shop shell. So a backend outage never
 * marks the storefront unhealthy and gets it restarted, and the probe costs nothing upstream.
 * proxy.ts skips this path (no redirect lookup, no session refresh).
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return new Response('ok', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
