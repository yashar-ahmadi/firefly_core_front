// Before the e2e suite: one request to the backend, so an exhausted anonymous budget
// (THROTTLE_ANON, 2000 an hour per address on the sample backend) stops the run with one clear
// message instead of dozens of specs failing on 429s.

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
  await response.body?.cancel().catch(() => undefined)
  if (response.status !== 429) return { kind: 'ok' }
  const header = response.headers.get('retry-after')
  return { kind: 'throttled', retryAfter: header && /^\d+$/.test(header) ? Number(header) : null }
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
