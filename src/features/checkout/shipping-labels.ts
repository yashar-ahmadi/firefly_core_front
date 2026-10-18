import type { ShippingOption } from '@/lib/api/types/shipping'
import { formatPercent, formatToman, toPersianDigits } from '@/lib/format'

// What a shipping option says (cart digest §3.9, §6.7, §9), and which one the checkout chooses
// for the shopper (the operator's default). Every amount is the option's own field: nothing is
// added up here. Pure.

export const COLLECT_AT_DOOR = 'پس\u{200C}کرایه'
export const FREE = 'رایگان'

/** «تحویل ۲ تا ۴ روز کاری» from business days; 0 is the same day; no days, no line. */
export function etaLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null
  const low = min ?? max!
  const high = max ?? min!
  if (high === 0) return 'تحویل همان روز'
  if (low === high) return `تحویل ${toPersianDigits(high)} روز کاری`
  if (low === 0) return `تحویل همان روز تا ${toPersianDigits(high)} روز کاری`
  return `تحویل ${toPersianDigits(low)} تا ${toPersianDigits(high)} روز کاری`
}

/** The fare is collected at the door by the carrier (tipax, heavy goods): never «free». */
export const collectedAtDoor = (option: ShippingOption) => option.freight_payer === 'recipient'

/**
 * The cost shown next to the name, from `total`: «رایگان» only when the option is available, at
 * 0, and its sender pays; a door-paid fare at 0 is «پس‌کرایه». An unavailable option has no
 * price at all (its 0 means nothing).
 */
export function costLabel(option: ShippingOption): string | null {
  if (!option.is_available) return null
  if (option.total === 0) return collectedAtDoor(option) ? COLLECT_AT_DOOR : FREE
  return formatToman(option.total)
}

/** The share of the at-the-door amount moved to the online payment, when there is one. */
export function prepaymentNote(option: ShippingOption): string | null {
  if (option.prepayment_percentage <= 0) return null
  return `${formatPercent(option.prepayment_percentage)} از مبلغ پرداخت در محل، به\u{200C}صورت پیش\u{200C}پرداخت آنلاین گرفته می\u{200C}شود.`
}

/**
 * The option the checkout chooses itself when none is chosen (controller ruling, Task 2 fix
 * round 1): the operator's default, i.e. the first option in the API's order (its
 * `display_order`) that is available and whose sender pays. Never a fare collected at the door
 * (پس‌کرایه), never with COD; none such, null (the shopper chooses). The operator's order
 * decides: nothing is guessed from the price or the name. `skip` holds the ones the API refused
 * for this cart (never tried again in a loop).
 */
export function defaultOption(
  options: readonly ShippingOption[],
  skip: ReadonlySet<string> = new Set(),
): ShippingOption | null {
  return (
    options.find(
      (option) => option.is_available && !collectedAtDoor(option) && !skip.has(option.code),
    ) ?? null
  )
}
