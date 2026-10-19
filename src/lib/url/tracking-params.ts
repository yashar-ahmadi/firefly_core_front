// Campaign and click identifiers that ads, newsletters and analytics append to a shop URL (Plan 5
// Task 7; seo digest §10, §13 «normalized query strings»). They never filter anything: a listing's
// API query is built from the API's own parameter names only (`parseListingParams`), so they never
// reach the API nor the Data Cache key; its canonical leaves them out; and a page whose query holds
// nothing else is indexed as the clean URL. Pure.

/**
 * `utm_*` (Google Analytics' campaign tags), Google's click ids (`gclid`, and `gbraid`/`wbraid` on
 * iOS), Meta's `fbclid`, Microsoft's `msclkid`, Yandex's `yclid`, Google Analytics' `_ga` and its
 * cross-domain `_gl`, and Google Merchant's `srsltid` (added to organic product results). Any
 * letter case.
 */
const TRACKING_PARAM =
  /^(?:utm_[a-z0-9_]+|gclid|gbraid|wbraid|fbclid|msclkid|yclid|_ga|_gl|srsltid)$/i

/** Whether a query key is a tracking parameter. */
export function isTrackingParam(key: string): boolean {
  return TRACKING_PARAM.test(key)
}

type RawParams = Record<string, string | string[] | undefined>

/** The query without its tracking parameters (a new object; every other key as it was). */
export function withoutTracking(sp: RawParams): RawParams {
  return Object.fromEntries(Object.entries(sp).filter(([key]) => !isTrackingParam(key)))
}
