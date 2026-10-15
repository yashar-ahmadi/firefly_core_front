import { isRedirect } from '@/lib/api/envelope'

/** What the API answered, already read in full so a 401 can be inspected and still relayed. */
export type UpstreamResult =
  | { kind: 'json'; status: number; body: Record<string, unknown>; retryAfter: string | null }
  | { kind: 'empty'; status: number; retryAfter: string | null }
  | {
      kind: 'error'
      status: number
      code: 'network_error' | 'upstream_redirect' | 'non_json_response'
      /** Kept from a non-JSON answer: an edge's HTML 429/503 page still says when to retry. */
      retryAfter?: string | null
    }

/** Statuses that must not carry a body. */
const NULL_BODY_STATUSES = new Set([204, 205])

function badGateway(code: 'network_error' | 'upstream_redirect'): UpstreamResult {
  return { kind: 'error', status: 502, code }
}

/**
 * One fetch to the API. Redirects are never followed (fetch would re-send the API key and the
 * bearer to the new location): a 3xx becomes `upstream_redirect`. A body that is not a JSON
 * object becomes `non_json_response`, keeping the status when it is an error status.
 */
export async function callUpstream(url: string, init: RequestInit): Promise<UpstreamResult> {
  let res: Response
  try {
    res = await fetch(url, { ...init, redirect: 'manual', cache: 'no-store' })
  } catch {
    return badGateway('network_error')
  }
  const retryAfter = res.headers.get('retry-after')

  if (isRedirect(res)) {
    await res.body?.cancel().catch(() => undefined)
    return badGateway('upstream_redirect')
  }
  if (NULL_BODY_STATUSES.has(res.status)) return { kind: 'empty', status: res.status, retryAfter }

  let text: string
  try {
    text = await res.text()
  } catch {
    return badGateway('network_error')
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      kind: 'error',
      status: res.status >= 400 ? res.status : 502,
      code: 'non_json_response',
      retryAfter,
    }
  }
  return { kind: 'json', status: res.status, body: body as Record<string, unknown>, retryAfter }
}
