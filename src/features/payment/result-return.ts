import { isRecord, readJson, writeJson } from '@/lib/store/json-storage'
import type { ReturnResult } from './result-copy'

// The bank's return to `/payment/callback/` (order digest §4.2): the backend's 302 adds
// `result` (success | failed | pending), `payment` (the payment's uuid; missing only for an
// unknown callback) and `code`. The uuid is a bearer credential (§1.3): once read it is kept for
// this tab only (sessionStorage, `ff-payment-return`) and taken out of the address bar and the
// tab's history (the page replaces the URL with `scrubbedPath`, keeping `result` and `code`).
// A reload of that address reads it back from here; another return in this tab never does (its
// own `result`/`code` must match the kept ones). Pure apart from sessionStorage, which never
// throws (json-storage).

export interface PaymentReturn {
  payment: string | null
  result: ReturnResult | null
  code: string | null
}

export const RETURN_KEY = 'ff-payment-return'

export const RESULT_PATH = '/payment/callback/'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CODE = /^[a-z][a-z0-9_]{0,63}$/
const RESULTS: readonly string[] = ['success', 'failed', 'pending']

const shaped = (value: string | null, shape: RegExp) =>
  value !== null && shape.test(value) ? value : null

function kept(): PaymentReturn | null {
  const stored = readJson('session', RETURN_KEY)
  if (!isRecord(stored) || typeof stored.payment !== 'string' || !UUID.test(stored.payment))
    return null
  const text = (value: unknown) => (typeof value === 'string' ? value : null)
  return {
    payment: stored.payment,
    result: RESULTS.includes(text(stored.result) ?? '') ? (stored.result as ReturnResult) : null,
    code: shaped(text(stored.code), CODE),
  }
}

/** The return as the address holds it, or (a reload of the scrubbed address) as this tab kept it. */
export function readReturn(location: { search: string }): PaymentReturn {
  const query = new URLSearchParams(location.search)
  const result = query.get('result')
  const own: PaymentReturn = {
    payment: shaped(query.get('payment'), UUID),
    result: result !== null && RESULTS.includes(result) ? (result as ReturnResult) : null,
    code: shaped(query.get('code'), CODE),
  }
  if (own.payment || query.has('payment')) return own
  const before = kept()
  return before && before.result === own.result && before.code === own.code ? before : own
}

/** Keeps the return's uuid for this tab (a reload of the scrubbed address). */
export function rememberReturn(ret: PaymentReturn): void {
  if (ret.payment) writeJson('session', RETURN_KEY, ret)
}

/** The result page's address without the uuid: `result` and `code` only. */
export function scrubbedPath(ret: PaymentReturn): string {
  const query = new URLSearchParams()
  if (ret.result) query.set('result', ret.result)
  if (ret.code) query.set('code', ret.code)
  const search = query.toString()
  return search ? `${RESULT_PATH}?${search}` : RESULT_PATH
}
