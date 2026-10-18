import { describe, expect, it } from 'vitest'
import { toLatinDigits } from '@/lib/format/digits'
import {
  gregorianToJalali,
  isJalaliLeapYear,
  jalaliMonthLength,
  jalaliToGregorian,
  JALALI_MONTHS,
  tehranDateTime,
  tehranIso,
} from '@/lib/format/jalali-calendar'

// The Jalali calendar the date input converts with (src/lib/format/jalali-calendar.ts), checked
// against what the shop prints everywhere: `Intl.DateTimeFormat('fa-IR-u-ca-persian')` in the
// Asia/Tehran time zone. Every day of twenty years, both ways, leap years and Esfand included.

const persian = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/** Intl's Jalali date of a Gregorian day (read at noon UTC: 15:30 in Tehran, the same day). */
function intlJalali(gy: number, gm: number, gd: number) {
  const parts = persian.formatToParts(new Date(Date.UTC(gy, gm - 1, gd, 12)))
  const part = (type: string) => Number(toLatinDigits(parts.find((p) => p.type === type)!.value))
  return { jy: part('year'), jm: part('month'), jd: part('day') }
}

describe('Jalali ⇄ Gregorian', () => {
  it('agrees with Intl on every day from 2015 to 2035, both ways', () => {
    const start = Date.UTC(2015, 0, 1)
    const end = Date.UTC(2035, 11, 31)
    let days = 0
    for (let time = start; time <= end; time += 86_400_000) {
      const day = new Date(time)
      const [gy, gm, gd] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()]
      const jalali = gregorianToJalali(gy, gm, gd)
      expect(jalali).toEqual(intlJalali(gy, gm, gd))
      expect(jalaliToGregorian(jalali.jy, jalali.jm, jalali.jd)).toEqual({ gy, gm, gd })
      days++
    }
    expect(days).toBeGreaterThan(7000)
  })

  it('the brief’s date: 1405/07/23 is 2026-10-15', () => {
    expect(jalaliToGregorian(1405, 7, 23)).toEqual({ gy: 2026, gm: 10, gd: 15 })
    expect(gregorianToJalali(2026, 10, 15)).toEqual({ jy: 1405, jm: 7, jd: 23 })
  })

  it('1 Farvardin: the first day of the year, after the last of Esfand', () => {
    expect(jalaliToGregorian(1405, 1, 1)).toEqual({ gy: 2026, gm: 3, gd: 21 })
    expect(jalaliToGregorian(1404, 1, 1)).toEqual({ gy: 2025, gm: 3, gd: 21 })
    expect(gregorianToJalali(2025, 3, 20)).toEqual({ jy: 1403, jm: 12, jd: 30 })
    expect(gregorianToJalali(2026, 3, 20)).toEqual({ jy: 1404, jm: 12, jd: 29 })
  })

  it('leap years have a 30th of Esfand (as Intl says), the others 29 days', () => {
    for (const year of [1395, 1399, 1403, 1408]) {
      expect(isJalaliLeapYear(year), `${year}`).toBe(true)
      expect(jalaliMonthLength(year, 12)).toBe(30)
      const { gy, gm, gd } = jalaliToGregorian(year, 12, 30)
      expect(intlJalali(gy, gm, gd)).toEqual({ jy: year, jm: 12, jd: 30 })
    }
    for (const year of [1400, 1401, 1402, 1404, 1405, 1406, 1407]) {
      expect(isJalaliLeapYear(year), `${year}`).toBe(false)
      expect(jalaliMonthLength(year, 12)).toBe(29)
    }
  })

  it('months 1–6 have 31 days, 7–11 have 30', () => {
    for (let month = 1; month <= 6; month++) expect(jalaliMonthLength(1405, month)).toBe(31)
    for (let month = 7; month <= 11; month++) expect(jalaliMonthLength(1405, month)).toBe(30)
  })

  it('names the months in Persian', () => {
    expect(JALALI_MONTHS).toHaveLength(12)
    expect(JALALI_MONTHS[0]).toBe('فروردین')
    expect(JALALI_MONTHS[6]).toBe('مهر')
    expect(JALALI_MONTHS[11]).toBe('اسفند')
  })
})

describe('Tehran wall time (+03:30, fixed since 2022)', () => {
  it('1405/07/23 15:00 is 2026-10-15T15:00:00+03:30', () => {
    expect(tehranIso({ jy: 1405, jm: 7, jd: 23, hour: 15, minute: 0 })).toBe(
      '2026-10-15T15:00:00+03:30',
    )
    expect(tehranIso({ jy: 1405, jm: 1, jd: 1, hour: 9, minute: 5 })).toBe(
      '2026-03-21T09:05:00+03:30',
    )
  })

  it('reads an instant as Tehran’s date and time, across midnight too', () => {
    expect(tehranDateTime(new Date('2026-10-15T11:30:00Z'))).toEqual({
      jy: 1405,
      jm: 7,
      jd: 23,
      hour: 15,
      minute: 0,
    })
    // 20:30 UTC is midnight in Tehran: the next day.
    expect(tehranDateTime(new Date('2026-10-15T20:30:00Z'))).toMatchObject({
      jd: 24,
      hour: 0,
      minute: 0,
    })
    expect(tehranDateTime(new Date('2026-10-15T15:00:00+03:30'))).toMatchObject({
      jd: 23,
      hour: 15,
    })
  })

  it('round-trips: an ISO it writes reads back as the same wall time', () => {
    const value = { jy: 1403, jm: 12, jd: 30, hour: 23, minute: 59 }
    expect(tehranDateTime(new Date(tehranIso(value)))).toEqual(value)
  })
})
