import type { GeoPoint } from '@/features/geo/coordinates'
import { isIranMobile, normalizeIranMobile, toLatinDigits, toPersianDigits } from '@/lib/format'
import type { Address, AddressPatch, AddressWriteRequest } from '@/lib/api/types/address'

// The address form's values and what they mean to the API (cart digest §7.2): the body of a
// create, the changed fields of an edit, and the checks that mirror the API's (it stays the
// judge). Pure.

export type AddressField =
  | 'title'
  | 'province'
  | 'city'
  | 'address'
  | 'plaque'
  | 'unit'
  | 'postalCode'
  | 'firstName'
  | 'lastName'
  | 'mobile'
  | 'location'
  | 'isDefault'

/** Every message of each field (one field can have several). */
export type FieldErrors = Partial<Record<AddressField, string[]>>

export interface AddressValues {
  title: string
  province: number | null
  city: number | null
  address: string
  /** As typed: «۱۲ب» and «12/1» are both plaques; never digit-converted. */
  plaque: string
  unit: string
  postalCode: string
  firstName: string
  lastName: string
  mobile: string
  /** Both coordinates or none. */
  location: GeoPoint | null
  isDefault: boolean
}

/** The form for `address`, or an empty one. The mobile shows as `09…`. */
export function valuesFrom(address?: Address): AddressValues {
  return {
    title: address?.title ?? '',
    province: address?.province ?? null,
    city: address?.city ?? null,
    address: address?.address ?? '',
    plaque: address?.plaque ?? '',
    unit: address?.unit ?? '',
    postalCode: address?.postal_code ?? '',
    firstName: address?.receiver_first_name ?? '',
    lastName: address?.receiver_last_name ?? '',
    mobile: address
      ? (normalizeIranMobile(address.receiver_mobile) ?? address.receiver_mobile)
      : '',
    location: address ? pointOf(address) : null,
    isDefault: address?.is_default ?? false,
  }
}

function pointOf({ latitude, longitude }: Address): GeoPoint | null {
  return latitude !== null && longitude !== null ? { latitude, longitude } : null
}

/** Latin digits, without the dashes and spaces of a printed code («۱۲۳۴۵-۶۷۸۹۰»). */
export function postalDigits(value: string): string {
  return toLatinDigits(value).replace(/[\s\-\u{2010}-\u{2015}]/gu, '')
}

/** `09…` in Latin digits, whatever was typed (Persian digits, +98, spaces). */
function mobileOf(value: string): string {
  return normalizeIranMobile(value) ?? toLatinDigits(value).trim()
}

/** A plaque or a unit: what was typed, or null for none. */
const optional = (value: string | null): string | null => value?.trim() || null

const LIMITS = { title: 50, name: 200, short: 20 } as const

function lengthError(value: string, max: number, name: string): string | null {
  return value.length > max ? `${name} حداکثر ${toPersianDigits(max)} نویسه است.` : null
}

/** Adds the checks' messages to `errors` (every message of a field, in order). */
function collector(errors: FieldErrors) {
  const add = (field: AddressField, message: string | null) => {
    if (message) errors[field] = [...(errors[field] ?? []), message]
  }
  const required = (
    field: AddressField,
    value: string,
    message: string,
    max: number,
    name: string,
  ) => add(field, value.trim() === '' ? message : lengthError(value.trim(), max, name))
  return { add, required }
}

/** «استان» and «شهر», both required. */
export function checkRegion(
  values: Pick<AddressValues, 'province' | 'city'>,
  errors: FieldErrors = {},
): FieldErrors {
  const { add } = collector(errors)
  if (values.province === null) add('province', 'استان را انتخاب کنید.')
  if (values.city === null) add('city', 'شهر را انتخاب کنید.')
  return errors
}

/**
 * The door: «آدرس کامل» (required), «پلاک» and «واحد» (20 characters at most), «کد پستی» (10
 * digits when given; required for a guest's order, `postalRequired`, cart digest §7.4).
 */
export function checkPlace(
  values: Pick<AddressValues, 'address' | 'plaque' | 'unit' | 'postalCode'>,
  { postalRequired = false }: { postalRequired?: boolean } = {},
  errors: FieldErrors = {},
): FieldErrors {
  const { add } = collector(errors)
  if (values.address.trim() === '') add('address', 'آدرس کامل را وارد کنید.')
  add('plaque', lengthError(values.plaque.trim(), LIMITS.short, 'پلاک'))
  add('unit', lengthError(values.unit.trim(), LIMITS.short, 'واحد'))
  const postal = postalDigits(values.postalCode)
  if (postal === '' && postalRequired) add('postalCode', 'کد پستی را وارد کنید.')
  else if (postal !== '' && !/^\d{10}$/.test(postal)) add('postalCode', 'کد پستی باید ۱۰ رقم باشد.')
  return errors
}

/** «گیرنده»: both names (200 characters at most) and an Iranian mobile. */
export function checkReceiver(
  values: Pick<AddressValues, 'firstName' | 'lastName' | 'mobile'>,
  errors: FieldErrors = {},
): FieldErrors {
  const { add, required } = collector(errors)
  required('firstName', values.firstName, 'نام گیرنده را وارد کنید.', LIMITS.name, 'نام گیرنده')
  required(
    'lastName',
    values.lastName,
    'نام خانوادگی گیرنده را وارد کنید.',
    LIMITS.name,
    'نام خانوادگی گیرنده',
  )
  if (values.mobile.trim() === '') add('mobile', 'شمارهٔ موبایل گیرنده را وارد کنید.')
  else if (!isIranMobile(values.mobile))
    add('mobile', 'شمارهٔ موبایل ایران را وارد کنید؛ مانند ۰۹۱۲۱۲۳۴۵۶۷.')
  return errors
}

/** The API's own checks, before it is asked (cart digest §7.2). */
export function checkAddress(values: AddressValues): FieldErrors {
  const errors: FieldErrors = {}
  collector(errors).required(
    'title',
    values.title,
    'عنوان آدرس را وارد کنید.',
    LIMITS.title,
    'عنوان آدرس',
  )
  checkRegion(values, errors)
  checkPlace(values, {}, errors)
  return checkReceiver(values, errors)
}

/** `POST account/address/create/` from checked values. */
export function createBody(values: AddressValues): AddressWriteRequest {
  const body: AddressWriteRequest = {
    title: values.title.trim(),
    province: values.province!,
    city: values.city!,
    address: values.address.trim(),
    postal_code: postalDigits(values.postalCode),
    receiver_first_name: values.firstName.trim(),
    receiver_last_name: values.lastName.trim(),
    receiver_mobile: mobileOf(values.mobile),
    is_default: values.isDefault,
  }
  const plaque = optional(values.plaque)
  const unit = optional(values.unit)
  if (plaque) body.plaque = plaque
  if (unit) body.unit = unit
  if (values.location) {
    body.latitude = values.location.latitude
    body.longitude = values.location.longitude
  }
  return body
}

const samePoint = (a: GeoPoint | null, b: GeoPoint | null) =>
  a === null || b === null ? a === b : a.latitude === b.latitude && a.longitude === b.longitude

/**
 * `PATCH account/address/{id}/update/`: what differs from `initial`. The province and the city
 * go together when either changed (the API reads a missing half from the row), the two
 * coordinates too (both null when the pin was removed). Empty when nothing changed.
 */
export function patchBody(values: AddressValues, initial: Address): AddressPatch {
  const patch: AddressPatch = {}
  const text = <K extends keyof AddressPatch>(key: K, now: AddressPatch[K], before: unknown) => {
    if (now !== before) patch[key] = now
  }
  text('title', values.title.trim(), initial.title)
  text('address', values.address.trim(), initial.address)
  text('receiver_first_name', values.firstName.trim(), initial.receiver_first_name)
  text('receiver_last_name', values.lastName.trim(), initial.receiver_last_name)
  text('receiver_mobile', mobileOf(values.mobile), mobileOf(initial.receiver_mobile))
  text('postal_code', postalDigits(values.postalCode), initial.postal_code)
  text('plaque', optional(values.plaque), optional(initial.plaque))
  text('unit', optional(values.unit), optional(initial.unit))
  text('is_default', values.isDefault, initial.is_default)
  if (values.province !== initial.province || values.city !== initial.city) {
    patch.province = values.province!
    patch.city = values.city!
  }
  if (!samePoint(values.location, pointOf(initial))) {
    patch.latitude = values.location?.latitude ?? null
    patch.longitude = values.location?.longitude ?? null
  }
  return patch
}
