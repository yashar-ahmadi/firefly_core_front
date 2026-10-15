// Number, money and percent formatting with Persian digits and separators.
//
// Intl emits a left-to-right mark (U+200E) before the minus sign (U+2212) of negative numbers
// so the sign stays attached to the digits inside an RTL paragraph. That mark is meaningful,
// so it is kept as-is. Prices and percentages shown in the storefront are normally >= 0.

const LOCALE = 'fa-IR'
// Persian percent sign (U+066A). Appended by hand rather than via `style: 'percent'` because
// the percent pattern differs between ICU versions (spaces and bidi marks around the sign).
const PERCENT_SIGN = '\u{066A}'

const decimal = new Intl.NumberFormat(LOCALE)
const wholeNumber = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 })

/** Group digits with Persian separators, e.g. 12500000 -> «۱۲٬۵۰۰٬۰۰۰». NaN/Infinity -> ''. */
export function formatNumber(n: number): string {
  return Number.isFinite(n) ? decimal.format(n) : ''
}

/**
 * Format a price in Toman, rounded to whole Toman: «۱۲٬۵۰۰٬۰۰۰ تومان».
 * Pass `{ suffix: false }` for the bare number. Non-finite amounts -> ''.
 */
export function formatToman(n: number, opts: { suffix?: boolean } = {}): string {
  if (!Number.isFinite(n)) return ''
  const amount = wholeNumber.format(n)
  return opts.suffix === false ? amount : `${amount} تومان`
}

/** Format a 0-100 value as «۲۵٪» (at most one fraction digit, no space). Non-finite -> ''. */
export function formatPercent(n: number): string {
  return Number.isFinite(n) ? `${oneDecimal.format(n)}${PERCENT_SIGN}` : ''
}
