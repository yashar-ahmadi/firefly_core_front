import type { NextRequest } from 'next/server'
import type { QueryInit } from '@/lib/api/envelope'

/**
 * CSRF guard for writes. Browsers cannot add `X-Requested-With` to a cross-site request without
 * a CORS preflight, which the BFF never grants; `Origin`, when sent, must also be our own host:
 * the request's `Host`, or the public `SITE_URL` host (for edges that rewrite `Host`).
 */
export function passesCsrf(req: NextRequest, siteUrl: string): boolean {
  if (req.headers.get('x-requested-with') !== 'ff') return false
  const origin = req.headers.get('origin')
  if (origin === null) return true
  const originHost = hostOf(origin)
  if (originHost === null) return false
  const host = req.headers.get('host')?.toLowerCase()
  return originHost === host || originHost === hostOf(siteUrl)
}

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.host : null
  } catch {
    return null
  }
}

/** The browser's query string as `QueryInit`, keeping repeated keys, for `apiPath`. */
export function queryOf(req: NextRequest): QueryInit {
  const query: Record<string, string[]> = {}
  for (const [key, value] of req.nextUrl.searchParams) (query[key] ??= []).push(value)
  return query
}

export interface OutgoingBody {
  body: BodyInit | undefined
  /** Headers that describe the body (`Content-Type`, and `Content-Length` for a stream). */
  headers: Record<string, string>
  /** False for a streamed upload: it cannot be sent a second time. */
  replayable: boolean
  streamed: boolean
}

export type JsonRewrite = (client: Record<string, unknown>) => Record<string, unknown>

const NO_BODY: OutgoingBody = { body: undefined, headers: {}, replayable: true, streamed: false }

function parseObject(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * The body to forward. GET sends none. Multipart is streamed untouched with its original
 * `Content-Type` (the boundary) and `Content-Length`. Anything else is read as text and sent with
 * its own content type (JSON by default); an empty body is dropped. `rewrite` replaces the body
 * with a JSON object built from the client's (used to inject the refresh cookie on logout).
 */
export async function readBody(
  req: NextRequest,
  method: string,
  rewrite?: JsonRewrite,
): Promise<OutgoingBody> {
  if (method === 'GET') return NO_BODY
  const contentType = req.headers.get('content-type')

  if (!rewrite && contentType?.toLowerCase().startsWith('multipart/form-data')) {
    if (!req.body) return NO_BODY
    const headers: Record<string, string> = { 'Content-Type': contentType }
    const length = req.headers.get('content-length')
    if (length && /^\d+$/.test(length)) headers['Content-Length'] = length
    return { body: req.body, headers, replayable: false, streamed: true }
  }

  const text = await req.text()
  if (rewrite) {
    const body = JSON.stringify(rewrite(parseObject(text)))
    return { ...NO_BODY, body, headers: { 'Content-Type': 'application/json' } }
  }
  if (text === '') return NO_BODY
  return { ...NO_BODY, body: text, headers: { 'Content-Type': contentType ?? 'application/json' } }
}
