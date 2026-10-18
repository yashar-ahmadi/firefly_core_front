import {
  checkPlace,
  checkReceiver,
  checkRegion,
  postalDigits,
  type AddressField,
  type AddressValues,
} from '@/features/account/addresses/address-values'
import type { OrderReceiverInput } from '@/lib/api/types/order'
import { isIranMobile, normalizeIranMobile, toLatinDigits } from '@/lib/format'

// A guest's receiver (cart digest §6.6, §7.4; order digest `OrderReceiverInput`): who takes the
// parcel and where, kept by the page until placement (Task 3 sends it as `receiver`), with the
// buyer's own mobile when someone else receives it (`customer_mobile`). The checks are the
// address book's own (./address-values), the postal code required here. Pure. The province and
// city are the cart's destination; the placement sends the rest (`receiverBody`).

export type GuestReceiver = Pick<
  AddressValues,
  | 'province'
  | 'city'
  | 'address'
  | 'plaque'
  | 'unit'
  | 'postalCode'
  | 'firstName'
  | 'lastName'
  | 'mobile'
> & {
  /** The buyer's own mobile (a gift): optional; tracking takes it, or the receiver's. */
  customerMobile: string
}

export type GuestField =
  Exclude<AddressField, 'title' | 'location' | 'isDefault'> | 'customerMobile'
export type GuestErrors = Partial<Record<GuestField, string[]>>

export const EMPTY_RECEIVER: GuestReceiver = {
  province: null,
  city: null,
  address: '',
  plaque: '',
  unit: '',
  postalCode: '',
  firstName: '',
  lastName: '',
  mobile: '',
  customerMobile: '',
}

const FIELDS = Object.keys(EMPTY_RECEIVER) as (keyof GuestReceiver)[]

/** Stored values (a draft), field by field: one of the wrong type is the empty one. */
export function receiverFrom(raw: unknown): GuestReceiver {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const values: GuestReceiver = { ...EMPTY_RECEIVER }
  for (const field of FIELDS) {
    const value = stored[field]
    const empty = EMPTY_RECEIVER[field]
    const fits = empty === null ? Number.isInteger(value) : typeof value === typeof empty
    if (fits) Object.assign(values, { [field]: value })
  }
  return values
}

/** What the API will check at placement, before it is asked (it stays the judge). */
export function checkGuestReceiver(values: GuestReceiver): GuestErrors {
  const errors: GuestErrors = checkRegion(values)
  checkPlace(values, { postalRequired: true }, errors)
  checkReceiver(values, errors)
  const own = values.customerMobile.trim()
  if (own !== '' && !isIranMobile(own)) {
    errors.customerMobile = ['شمارهٔ موبایل ایران را وارد کنید؛ مانند ۰۹۱۲۱۲۳۴۵۶۷.']
  }
  return errors
}

/** `09…` in Latin digits, whatever was typed (Persian digits, +98, spaces). */
const mobileOf = (value: string) => normalizeIranMobile(value) ?? toLatinDigits(value).trim()

/** The placement's `receiver` and the buyer's own mobile, from checked values. */
export function receiverBody(values: GuestReceiver): {
  receiver: OrderReceiverInput
  customerMobile?: string
} {
  const receiver: OrderReceiverInput = {
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    mobile: mobileOf(values.mobile),
    address: values.address.trim(),
    postal_code: postalDigits(values.postalCode),
  }
  const plaque = values.plaque.trim()
  const unit = values.unit.trim()
  if (plaque) receiver.plaque = plaque
  if (unit) receiver.unit = unit
  const own = values.customerMobile.trim()
  return own ? { receiver, customerMobile: mobileOf(own) } : { receiver }
}
