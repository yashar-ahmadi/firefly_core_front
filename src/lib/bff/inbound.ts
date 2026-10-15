import type { NextRequest } from 'next/server'
import type { QueryInit } from '@/lib/api/envelope'

/**
 * CSRF guard. Every method needs `X-Requested-With: ff`: a browser cannot add it to a cross-site
 * request without a CORS preflight, which the BFF never grants, and a top-level navigation
 * (which carries the Lax cookies) cannot add it at all. For anything but GET, `Origin`, when
 * sent, must also be our own host: the request's `Host`, or the `SITE_URL` host (for edges that
 * rewrite `Host`).
 */
export function passesCsrf(req: NextRequest, method: string, siteUrl: string): boolean {
  if (req.headers.get('x-requested-with') !== 'ff') return false
  if (method === 'GET') return true
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

/** The API refuses non-file bodies over 2.5 MiB; read no more than that. */
export const MAX_BODY_BYTES = 2_621_440
/** Receipt and avatar uploads are at most 5 MiB, plus multipart overhead. */
export const MAX_MULTIPART_BYTES = 6 * 1024 * 1024

/** The request body is over its cap: answer 413 `request_too_large`. */
export class RequestTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the BFF limit')
    this.name = 'RequestTooLargeError'
  }
}

export interface OutgoingBody {
  body: BodyInit | undefined
  /** Headers that describe the body (`Content-Type`, and `Content-Length` for a stream). */
  headers: Record<string, string>
  /** False for a streamed upload: it cannot be sent a second time. */
  replayable: boolean
  streamed: boolean
  /** True once a streamed body went over its cap (the upstream fetch then fails). */
  overflowed: () => boolean
}

export type JsonRewrite = (client: Record<string, unknown>) => Record<string, unknown>

const NO_BODY: OutgoingBody = {
  body: undefined,
  headers: {},
  replayable: true,
  streamed: false,
  overflowed: () => false,
}

function declaredOver(req: NextRequest, limit: number): boolean {
  const length = req.headers.get('content-length')
  return length !== null && /^\d+$/.test(length) && Number(length) > limit
}

/** Read the whole body as UTF-8, giving up as soon as it passes `limit` bytes. */
async function readText(req: NextRequest, limit: number): Promise<string> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      throw new RequestTooLargeError()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** Pass the stream through, erroring it (and flagging the overflow) once it passes `limit`. */
function capStream(stream: ReadableStream<Uint8Array>, limit: number) {
  let total = 0
  let over = false
  const capped = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength
        if (total > limit) {
          over = true
          controller.error(new RequestTooLargeError())
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
  return { capped, overflowed: () => over }
}

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
 * Throws `RequestTooLargeError` when a declared `Content-Length` or the bytes read pass the cap
 * (`MAX_MULTIPART_BYTES` for multipart, `MAX_BODY_BYTES` otherwise).
 */
export async function readBody(
  req: NextRequest,
  method: string,
  rewrite?: JsonRewrite,
): Promise<OutgoingBody> {
  if (method === 'GET') return NO_BODY
  const contentType = req.headers.get('content-type')

  if (!rewrite && contentType?.toLowerCase().startsWith('multipart/form-data')) {
    if (declaredOver(req, MAX_MULTIPART_BYTES)) throw new RequestTooLargeError()
    if (!req.body) return NO_BODY
    const headers: Record<string, string> = { 'Content-Type': contentType }
    const length = req.headers.get('content-length')
    if (length && /^\d+$/.test(length)) headers['Content-Length'] = length
    const { capped, overflowed } = capStream(req.body, MAX_MULTIPART_BYTES)
    return { body: capped, headers, replayable: false, streamed: true, overflowed }
  }

  if (declaredOver(req, MAX_BODY_BYTES)) throw new RequestTooLargeError()
  const text = await readText(req, MAX_BODY_BYTES)
  if (rewrite) {
    const body = JSON.stringify(rewrite(parseObject(text)))
    return { ...NO_BODY, body, headers: { 'Content-Type': 'application/json' } }
  }
  if (text === '') return NO_BODY
  return { ...NO_BODY, body: text, headers: { 'Content-Type': contentType ?? 'application/json' } }
}
