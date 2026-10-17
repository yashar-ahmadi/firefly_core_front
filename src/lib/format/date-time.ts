import { CALENDAR_LOCALE, dateFormats, normalizeIntlText, parseDate, TIME_ZONE } from './date'

// The time of day and relative times, in the Asia/Tehran time zone (Jalali dates: ./date). Like
// ./date, every function returns '' for an unparseable input instead of throwing.

const SECOND = 1
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH_DAYS = 30
const YEAR_DAYS = 365

// `hourCycle: 'h23'` (not `hour12: false`) so midnight renders as 00:00 and never 24:00.
const timeFormat = new Intl.DateTimeFormat(CALENDAR_LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const relativeFormat = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' })

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
