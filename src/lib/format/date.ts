// Jalali (Persian calendar) date formatting in the Asia/Tehran time zone. The time of day and
// relative times are in ./date-time, imported directly (a page that only shows dates ships none
// of them; see ./index).
//
// Every function returns '' for an unparseable input instead of throwing, so a bad value from
// the API can never crash a render; callers can fall back with `|| '—'`.

export const TIME_ZONE = 'Asia/Tehran'
export const CALENDAR_LOCALE = 'fa-IR-u-ca-persian'

export type JalaliDateStyle = 'long' | 'short' | 'weekday'

export const dateFormats: Record<JalaliDateStyle, Intl.DateTimeFormat> = {
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

/**
 * Intl output varies slightly between ICU versions (bidi marks, non-breaking spaces). Strip
 * U+200E/U+200F/U+061C and turn U+00A0/U+202F into plain spaces so the strings are stable.
 */
export function normalizeIntlText(text: string): string {
  return text.replace(/[\u{200E}\u{200F}\u{061C}]/gu, '').replace(/[\u{00A0}\u{202F}]/gu, ' ')
}

export function parseDate(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** «۲۳ مهر ۱۴۰۵» (long), «۱۴۰۵/۰۷/۲۳» (short) or «پنجشنبه ۲۳ مهر» (weekday). */
export function formatJalaliDate(iso: string, style: JalaliDateStyle = 'long'): string {
  const date = parseDate(iso)
  return date ? normalizeIntlText(dateFormats[style].format(date)) : ''
}
