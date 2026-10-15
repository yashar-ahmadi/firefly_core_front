// Jalali (Persian calendar) date formatting in the Asia/Tehran time zone.
//
// Every function returns '' for an unparseable input instead of throwing, so a bad value from
// the API can never crash a render; callers can fall back with `|| '—'`.

const TIME_ZONE = 'Asia/Tehran'
const CALENDAR_LOCALE = 'fa-IR-u-ca-persian'

const SECOND = 1
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH_DAYS = 30
const YEAR_DAYS = 365

export type JalaliDateStyle = 'long' | 'short' | 'weekday'

const dateFormats: Record<JalaliDateStyle, Intl.DateTimeFormat> = {
  long: new Intl.DateTimeFormat(CALENDAR_LOCALE, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
  short: new Intl.DateTimeFormat(CALENDAR_LOCALE, {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }),
  weekday: new Intl.DateTimeFormat(CALENDAR_LOCALE, {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }),
}

// `hourCycle: 'h23'` (not `hour12: false`) so midnight renders as 00:00 and never 24:00.
const timeFormat = new Intl.DateTimeFormat(CALENDAR_LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const relativeFormat = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' })

/**
 * Intl output varies slightly between ICU versions (bidi marks, non-breaking spaces). Strip
 * U+200E/U+200F/U+061C and turn U+00A0/U+202F into plain spaces so the strings are stable.
 */
function normalizeIntlText(text: string): string {
  return text.replace(/[\u{200E}\u{200F}\u{061C}]/gu, '').replace(/[\u{00A0}\u{202F}]/gu, ' ')
}

function parseDate(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** «۲۳ مهر ۱۴۰۵» (long), «۱۴۰۵/۰۷/۲۳» (short) or «پنجشنبه ۲۳ مهر» (weekday). */
export function formatJalaliDate(iso: string, style: JalaliDateStyle = 'long'): string {
  const date = parseDate(iso)
  return date ? normalizeIntlText(dateFormats[style].format(date)) : ''
}

/** «۲۳ مهر ۱۴۰۵، ساعت ۱۵:۰۰» — long date plus 24-hour Tehran time. */
export function formatJalaliDateTime(iso: string): string {
  const date = parseDate(iso)
  if (!date) return ''
  return `${normalizeIntlText(dateFormats.long.format(date))}، ساعت ${normalizeIntlText(timeFormat.format(date))}`
}

/**
 * Relative time from `now` using the largest sensible unit, truncating toward zero:
 * under a minute -> «لحظاتی پیش» / «لحظاتی دیگر»; then minutes, hours, days (< 30), months
 * (30-day months, up to 11) and years (365-day years). Uses `numeric: 'auto'`, so one day
 * reads «دیروز» / «فردا».
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = parseDate(iso)
  if (!date) return ''

  const diffSeconds = (date.getTime() - now.getTime()) / 1000
  const abs = Math.abs(diffSeconds)
  const sign = diffSeconds < 0 ? -1 : 1

  if (abs < MINUTE) return diffSeconds > 0 ? 'لحظاتی دیگر' : 'لحظاتی پیش'

  let value: number
  let unit: Intl.RelativeTimeFormatUnit
  const days = Math.trunc(abs / DAY)
  if (abs < HOUR) {
    value = Math.trunc(abs / MINUTE)
    unit = 'minute'
  } else if (abs < DAY) {
    value = Math.trunc(abs / HOUR)
    unit = 'hour'
  } else if (days < MONTH_DAYS) {
    value = days
    unit = 'day'
  } else if (days < YEAR_DAYS) {
    value = Math.min(11, Math.trunc(days / MONTH_DAYS))
    unit = 'month'
  } else {
    value = Math.trunc(days / YEAR_DAYS)
    unit = 'year'
  }
  return normalizeIntlText(relativeFormat.format(sign * value, unit))
}
