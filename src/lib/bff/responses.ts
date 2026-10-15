import { NextResponse } from 'next/server'

/** The API's own per-status `msg` sentences (backend `utils/http.py`), for envelopes we build. */
const STATUS_MESSAGES: Record<number, string> = {
  403: 'اجازهٔ انجام این درخواست را ندارید.',
  404: 'موردی با این مشخصات پیدا نشد.',
  502: 'پاسخ سرویس بیرونی معتبر نیست.',
}
const DEFAULT_FAILURE_MESSAGE = 'درخواست شما انجام نشد.'

export const NOT_FOUND_DETAIL = 'یافت نشد.'
export const CSRF_DETAIL = 'درخواست از مبدأ معتبر ارسال نشده است. صفحه را دوباره بارگذاری کنید.'

/** Every BFF answer is per-user: no shared cache may keep it. */
function baseHeaders(retryAfter?: string | null): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  if (retryAfter) headers.set('Retry-After', retryAfter)
  return headers
}

/** A JSON envelope response with the given status. */
export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  retryAfter?: string | null,
): NextResponse {
  return NextResponse.json(body, { status, headers: baseHeaders(retryAfter) })
}

/** A response without a body (204/205). */
export function emptyResponse(status: number, retryAfter?: string | null): NextResponse {
  return new NextResponse(null, { status, headers: baseHeaders(retryAfter) })
}

/** An error envelope shaped like the API's own (`{ msg, code, data: { type, errors } }`). */
export function errorResponse(status: number, code: string, detail: string): NextResponse {
  return jsonResponse(status, {
    msg: STATUS_MESSAGES[status] ?? DEFAULT_FAILURE_MESSAGE,
    code: status,
    data: {
      type: status >= 500 ? 'server_error' : 'client_error',
      errors: [{ code, detail, attr: null }],
    },
  })
}
