import {
  checkPlace,
  checkReceiver,
  checkRegion,
  type AddressField,
  type AddressValues,
} from '@/features/account/addresses/address-values'
import { isIranMobile } from '@/lib/format'

// A guest's receiver (cart digest §6.6, §7.4; order digest `OrderReceiverInput`): who takes the
// parcel and where, kept by the page until placement (Task 3 sends it as `receiver`), with the
// buyer's own mobile when someone else receives it (`customer_mobile`). The checks are the
// address book's own (./address-values), the postal code required here. Pure.

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
