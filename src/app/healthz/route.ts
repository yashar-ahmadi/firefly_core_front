import { getServerEnv } from '@/config/env'

/**
 * Health probe for the container healthcheck and load balancers (`/healthz/`). It validates the
 * runtime environment (spec §6.2: a container with a missing or invalid variable must not report
 * healthy) and nothing else: no API call, no settings, no shop shell. So a backend outage never
 * marks the storefront unhealthy and gets it restarted, and the probe costs nothing upstream.
 *
 * - valid environment: 200 `ok`;
 * - invalid environment: 503 `unhealthy`, with no detail in the response. The list of invalid
 *   variables (names and rules only, never values) is logged once per process for operators.
 *
 * Validation happens here, on the first probe, rather than in `instrumentation.ts`, so that
 * `next build` never needs the runtime variables. proxy.ts skips this path.
 */
export const dynamic = 'force-dynamic'

const HEADERS = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }

/** The probe runs every 30 s: report a broken environment once, not on every probe. */
let reported = false

export function GET(): Response {
  try {
    getServerEnv()
  } catch (error) {
    if (!reported) {
      reported = true
      console.error('[healthz] unhealthy:', error instanceof Error ? error.message : error)
    }
    return new Response('unhealthy', { status: 503, headers: HEADERS })
  }
  return new Response('ok', { headers: HEADERS })
}
