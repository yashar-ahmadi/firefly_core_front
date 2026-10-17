export { toLatinDigits, toPersianDigits } from './digits'
export { formatNumber, formatPercent, formatToman } from './number'
// The time of day and relative times (`formatJalaliDateTime`, `formatRelative`) are imported from
// './date-time' itself: re-exported here, their formatters would ship with every page that only
// shows dates (the bundler keeps a re-exported module whose top level builds `Intl` formatters).
export { formatJalaliDate, type JalaliDateStyle } from './date'
export { formatIranMobile, isIranMobile, normalizeIranMobile } from './phone'
