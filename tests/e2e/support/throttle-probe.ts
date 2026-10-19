// Before the e2e suite: one request to the backend, so an exhausted anonymous budget
// (THROTTLE_ANON, 2000 an hour per address on the sample backend) stops the run with one clear
// message ("wait N s", from Retry-After or the body's `retry_after`) instead of dozens of specs
// failing on 429s. A budget nearly used up by earlier full runs: support/anon-budget.ts.

/** A cheap anonymous read that the backend's anonymous throttle counts. */
export const PROBE_PATH = '/api/v1/product/settings/'

export type ProbeResult =
  | { kind: 'ok' }
  | { kind: 'throttled'; retryAfter: number | null }
  | { kind: 'unreachable'; reason: string }

export async function probeBackend(
  apiUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  let response: Response
  try {
    response = await fetchImpl(`${apiUrl.replace(/\/+$/, '')}${PROBE_PATH}`, {
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    return { kind: 'unreachable', reason: error instanceof Error ? error.message : String(error) }
  }
  if (response.status !== 429) {
    await response.body?.cancel().catch(() => undefined)
    return { kind: 'ok' }
  }
  const header = response.headers.get('retry-after')
  if (header && /^\d+$/.test(header)) return { kind: 'throttled', retryAfter: Number(header) }
  // The API's own envelope says it too (`data.retry_after`, seconds).
  const body = (await response.json().catch(() => null)) as {
    data?: { retry_after?: unknown }
  } | null
  const wait = body?.data?.retry_after
  return { kind: 'throttled', retryAfter: typeof wait === 'number' && wait > 0 ? wait : null }
}

/** The message that aborts the run, or null to go on. */
export function probeVerdict(result: ProbeResult, apiUrl: string): string | null {
  if (result.kind !== 'throttled') return null
  const wait =
    result.retryAfter === null
      ? 'for the sliding hour to clear'
      : `about ${Math.ceil(result.retryAfter / 60)} min (Retry-After: ${result.retryAfter} s)`
  return [
    `The backend at ${apiUrl} answered 429: its anonymous budget for this address`,
    '(THROTTLE_ANON, 2000 requests an hour on the sample backend) is used up, so most specs',
    `would fail. Wait ${wait}, or start the local backend with a larger budget,`,
    'e.g. THROTTLE_ANON=20000/hour. See docs/ARCHITECTURE.md (Testing) and docs/DEPLOYMENT.md.',
  ].join(' ')
}
