// The Jalali (Solar Hijri) calendar and Tehran's wall time, for inputs that write dates (the
// card-transfer receipt's «تاریخ و ساعت واریز»). Pure; not re-exported from ./index (only the
// pages with such an input load it).
//
// The conversion is ICU's own arithmetic Persian calendar (icu4c `persncal.cpp`: a year is leap
// when (25·y + 11) mod 33 < 8), so what an input offers agrees day for day with what the shop
// prints through `Intl.DateTimeFormat('fa-IR-u-ca-persian')` (./date), checked over twenty years
// in tests/unit/format/jalali-calendar.test.ts. Days are counted as ICU counts them: Julian day
// numbers, 1 Farvardin 1 AP being 1948320 and 1 January 1970 2440588.
//
// Tehran's time is a fixed +03:30 (an assumption, documented): Iran abolished daylight saving
// time in 2022, so its clocks have stayed at +03:30 since the last change, in September 2022.
// Were it ever reinstated, this module and `TEHRAN_OFFSET` are where to change it; the API itself
// sends and reads datetimes at +03:30 (order digest §1.4).

export interface JalaliDate {
  jy: number
  /** 1–12. */
  jm: number
  jd: number
}

export interface GregorianDate {
  gy: number
  /** 1–12. */
  gm: number
  gd: number
}

/** A date and a time of day in Tehran. */
export interface TehranDateTime extends JalaliDate {
  hour: number
  minute: number
}

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const

export const TEHRAN_OFFSET = '+03:30'
const TEHRAN_OFFSET_MS = 210 * 60_000

const PERSIAN_EPOCH = 1_948_320
const UNIX_EPOCH = 2_440_588
const DAY_MS = 86_400_000
/** Days before each month: six of 31, five of 30, then Esfand. */
const MONTH_START = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336]

const floorDiv = (a: number, b: number) => Math.floor(a / b)
const mod = (a: number, b: number) => a - b * floorDiv(a, b)

export function isJalaliLeapYear(jy: number): boolean {
  return mod(25 * jy + 11, 33) < 8
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

/** Days from the Persian epoch to 1 Farvardin of `jy` (ICU's `handleComputeMonthStart`). */
const yearStart = (jy: number) => 365 * (jy - 1) + floorDiv(8 * jy + 21, 33)

export function jalaliToGregorian(jy: number, jm: number, jd: number): GregorianDate {
  const julianDay = PERSIAN_EPOCH + yearStart(jy) + MONTH_START[jm - 1]! + jd - 1
  const date = new Date((julianDay - UNIX_EPOCH) * DAY_MS)
  return { gy: date.getUTCFullYear(), gm: date.getUTCMonth() + 1, gd: date.getUTCDate() }
}

export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const sinceEpoch = Date.UTC(gy, gm - 1, gd) / DAY_MS + UNIX_EPOCH - PERSIAN_EPOCH
  const jy = 1 + floorDiv(33 * sinceEpoch + 3, 12_053)
  const dayOfYear = sinceEpoch - yearStart(jy)
  const month = dayOfYear < 216 ? floorDiv(dayOfYear, 31) : floorDiv(dayOfYear - 6, 30)
  return { jy, jm: month + 1, jd: dayOfYear - MONTH_START[month]! + 1 }
}

/** `instant` as Tehran's date and time of day (to the minute). */
export function tehranDateTime(instant: Date): TehranDateTime {
  const wall = new Date(instant.getTime() + TEHRAN_OFFSET_MS)
  return {
    ...gregorianToJalali(wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate()),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
  }
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

/** «2026-10-15T15:00:00+03:30»: Tehran's wall time as the API reads it. */
export function tehranIso({ jy, jm, jd, hour, minute }: TehranDateTime): string {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd)
  return `${pad(gy, 4)}-${pad(gm)}-${pad(gd)}T${pad(hour)}:${pad(minute)}:00${TEHRAN_OFFSET}`
}
