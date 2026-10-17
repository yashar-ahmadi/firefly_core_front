import { describe, expect, it } from 'vitest'
import { formatJalaliDate } from '@/lib/format/date'
import { formatJalaliDateTime, formatRelative } from '@/lib/format/date-time'

// 2026-10-15 15:00 in Tehran is Thursday 23 Mehr 1405.
const ISO = '2026-10-15T15:00:00+03:30'

describe('formatJalaliDate', () => {
  it('formats the long style by default', () => {
    expect(formatJalaliDate(ISO)).toBe('۲۳ مهر ۱۴۰۵')
    expect(formatJalaliDate(ISO, 'long')).toBe('۲۳ مهر ۱۴۰۵')
  })

  it('formats the short style', () => {
    expect(formatJalaliDate(ISO, 'short')).toBe('۱۴۰۵/۰۷/۲۳')
  })

  it('formats the weekday style', () => {
    expect(formatJalaliDate(ISO, 'weekday')).toBe('پنجشنبه ۲۳ مهر')
  })

  it('renders the Tehran calendar day regardless of the input offset', () => {
    // 20:30 UTC is already 00:00 of the next day in Tehran (UTC+03:30, no DST).
    expect(formatJalaliDate('2026-10-15T20:30:00Z')).toBe('۲۴ مهر ۱۴۰۵')
    expect(formatJalaliDate('2026-10-15T20:29:00Z')).toBe('۲۳ مهر ۱۴۰۵')
  })

  it('crosses the Jalali year boundary correctly', () => {
    expect(formatJalaliDate('2026-03-20T12:00:00+03:30')).toBe('۲۹ اسفند ۱۴۰۴')
    expect(formatJalaliDate('2026-03-21T12:00:00+03:30')).toBe('۱ فروردین ۱۴۰۵')
  })

  it('accepts date-only ISO strings', () => {
    expect(formatJalaliDate('2026-10-15')).toBe('۲۳ مهر ۱۴۰۵')
  })

  it('returns an empty string for an unparseable value', () => {
    expect(formatJalaliDate('not-a-date')).toBe('')
    expect(formatJalaliDate('')).toBe('')
  })

  it('never emits bidi marks or non-breaking spaces', () => {
    for (const style of ['long', 'short', 'weekday'] as const) {
      expect(formatJalaliDate(ISO, style)).not.toMatch(
        /[\u{200E}\u{200F}\u{061C}\u{00A0}\u{202F}]/u,
      )
    }
  })
})

describe('formatJalaliDateTime', () => {
  it('joins the long date and the 24-hour time', () => {
    expect(formatJalaliDateTime(ISO)).toBe('۲۳ مهر ۱۴۰۵، ساعت ۱۵:۰۰')
  })

  it('renders midnight as 00:00, not 24:00', () => {
    expect(formatJalaliDateTime('2026-10-15T20:30:00Z')).toBe('۲۴ مهر ۱۴۰۵، ساعت ۰۰:۰۰')
  })

  it('zero-pads single-digit hours and minutes', () => {
    expect(formatJalaliDateTime('2026-10-15T05:05:00+03:30')).toBe('۲۳ مهر ۱۴۰۵، ساعت ۰۵:۰۵')
  })

  it('returns an empty string for an unparseable value', () => {
    expect(formatJalaliDateTime('nope')).toBe('')
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-10-15T15:00:00+03:30')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('formats hours in the past', () => {
    expect(formatRelative('2026-10-15T12:00:00+03:30', now)).toBe('۳ ساعت پیش')
  })

  it('says "moments ago" / "in a moment" under a minute', () => {
    expect(formatRelative(ago(30_000), now)).toBe('لحظاتی پیش')
    expect(formatRelative(ago(0), now)).toBe('لحظاتی پیش')
    expect(formatRelative(ago(-30_000), now)).toBe('لحظاتی دیگر')
  })

  it('picks minutes between 1 and 59 minutes', () => {
    expect(formatRelative(ago(60_000), now)).toBe('۱ دقیقه پیش')
    expect(formatRelative(ago(10 * MIN), now)).toBe('۱۰ دقیقه پیش')
    expect(formatRelative(ago(59 * MIN + 59_000), now)).toBe('۵۹ دقیقه پیش')
  })

  it('picks hours between 1 and 23 hours, truncating', () => {
    expect(formatRelative(ago(HOUR), now)).toBe('۱ ساعت پیش')
    expect(formatRelative(ago(90 * MIN), now)).toBe('۱ ساعت پیش')
    expect(formatRelative(ago(23 * HOUR + 59 * MIN), now)).toBe('۲۳ ساعت پیش')
  })

  it('picks days from 1 to 29 days', () => {
    expect(formatRelative(ago(DAY), now)).toBe('دیروز')
    expect(formatRelative(ago(3 * DAY), now)).toBe('۳ روز پیش')
    expect(formatRelative(ago(29 * DAY), now)).toBe('۲۹ روز پیش')
  })

  it('picks months from 30 days up to a year', () => {
    expect(formatRelative(ago(30 * DAY), now)).toBe('ماه گذشته')
    expect(formatRelative(ago(65 * DAY), now)).toBe('۲ ماه پیش')
    expect(formatRelative(ago(364 * DAY), now)).toBe('۱۱ ماه پیش')
  })

  it('picks years from 365 days', () => {
    expect(formatRelative(ago(365 * DAY), now)).toBe('سال گذشته')
    expect(formatRelative(ago(2 * 365 * DAY + DAY), now)).toBe('۲ سال پیش')
  })

  it('formats the future', () => {
    expect(formatRelative(ago(-3 * HOUR), now)).toBe('۳ ساعت بعد')
    expect(formatRelative(ago(-DAY), now)).toBe('فردا')
    expect(formatRelative(ago(-10 * MIN), now)).toBe('۱۰ دقیقه بعد')
  })

  it('defaults "now" to the current time', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * MIN).toISOString()
    expect(formatRelative(tenMinutesAgo)).toBe('۱۰ دقیقه پیش')
  })

  it('returns an empty string for an unparseable value', () => {
    expect(formatRelative('garbage', now)).toBe('')
  })
})
