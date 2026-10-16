import type { ApiErrorItem, FeatureKey } from '@/lib/api/types/common'
import { isFeatureKey } from '@/lib/api/types/common'

/** Shown when the server cannot be reached or answers with something that is not the API. */
export const NETWORK_ERROR_DETAIL = 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.'

const GENERIC_ERROR_DETAIL = 'خطایی رخ داد. لطفاً دوباره تلاش کنید.'

export interface ApiErrorInit {
  status: number
  code?: string
  detail?: string
  errors?: ApiErrorItem[]
  retryAfter?: number | null
  feature?: FeatureKey | null
  data?: Record<string, unknown>
  cause?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeErrors(raw: unknown): ApiErrorItem[] {
  if (!Array.isArray(raw)) return []
  const items: ApiErrorItem[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.code !== 'string') continue
    items.push({
      code: entry.code,
      detail: typeof entry.detail === 'string' ? entry.detail : '',
      attr: typeof entry.attr === 'string' ? entry.attr : null,
    })
  }
  return items
}

/** `Retry-After` in delta-seconds form; HTTP-dates are not used by the API. */
function parseRetryAfterHeader(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null
  return Number(value.trim())
}

/**
 * Every failure of an API call: a non-2xx envelope, a body that is not JSON, or no connection.
 * Branch on `code`, show `detail`. `status` is 0 when no HTTP response was received.
 */
export class ApiError extends Error {
  readonly status: number
  /** First error's code, else `http_<status>`. */
  readonly code: string
  readonly errors: ApiErrorItem[]
  /** First error's detail (Persian, user-facing), else the envelope `msg`. */
  readonly detail: string
  /** Seconds to wait: `data.retry_after`, else (429 only) the `Retry-After` header. */
  readonly retryAfter: number | null
  /** Set on `503 feature_disabled`. */
  readonly feature: FeatureKey | null
  /** The whole `data` object, so extra keys (`open_attempt`, `known_statuses`...) stay reachable. */
  readonly data: Record<string, unknown>

  constructor(init: ApiErrorInit) {
    const errors = init.errors ?? []
    const detail = init.detail || errors[0]?.detail || GENERIC_ERROR_DETAIL
    super(detail, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code || errors[0]?.code || `http_${init.status}`
    this.errors = errors
    this.detail = detail
    this.retryAfter = init.retryAfter ?? null
    this.feature = init.feature ?? null
    this.data = init.data ?? {}
  }

  /** Build from a parsed non-2xx JSON body (`{ msg, code, data }`). */
  static fromBody(
    status: number,
    body: Record<string, unknown>,
    retryAfterHeader?: string | null,
  ): ApiError {
    const data = isRecord(body.data) ? body.data : {}
    const errors = normalizeErrors(data.errors)
    // The header only means "retry in N seconds" on a 429: a 503 feature_disabled also sends
    // `Retry-After: 300`, but the feature stays off until an operator switches it back on.
    const retryAfter =
      typeof data.retry_after === 'number' && Number.isFinite(data.retry_after)
        ? data.retry_after
        : status === 429
          ? parseRetryAfterHeader(retryAfterHeader)
          : null
    return new ApiError({
      status,
      detail: errors[0]?.detail || (typeof body.msg === 'string' ? body.msg : undefined),
      errors,
      retryAfter,
      feature: isFeatureKey(data.feature) ? data.feature : null,
      data,
    })
  }

  /** The server answered, but not with the API's JSON envelope (HTML from a proxy or dev server). */
  static nonJson(status: number): ApiError {
    return new ApiError({ status, code: 'non_json_response', detail: NETWORK_ERROR_DETAIL })
  }

  /** The API answered with a 3xx. Redirects are never followed, so the API key cannot leak. */
  static upstreamRedirect(): ApiError {
    return new ApiError({ status: 502, code: 'upstream_redirect', detail: NETWORK_ERROR_DETAIL })
  }

  /** No usable response: DNS or connection failure, reset body stream, or timeout. */
  static network(cause?: unknown): ApiError {
    return new ApiError({ status: 0, code: 'network_error', detail: NETWORK_ERROR_DETAIL, cause })
  }

  isFeatureDisabled(): boolean {
    return this.feature !== null || this.code === 'feature_disabled'
  }

  isAuth(): boolean {
    return this.status === 401
  }

  /**
   * Messages keyed by `attr` (dotted names such as `receiver.mobile` stay as they are);
   * errors without an attr go under `non_field_errors`. The first message per key wins.
   */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const error of this.errors) {
      const key = error.attr ?? 'non_field_errors'
      if (!Object.hasOwn(result, key)) result[key] = error.detail
    }
    return result
  }
}

/**
 * Whether the API itself answered 404 (its JSON envelope). A 404 page from a proxy or the dev
 * server in front of it (`non_json_response`) is an outage, never a missing record.
 */
export function isApiNotFound(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404 && error.code !== 'non_json_response'
}
