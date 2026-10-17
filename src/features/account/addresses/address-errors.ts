import { ApiError, GENERIC_ERROR_DETAIL, isApiNotFound } from '@/lib/api/errors'
import type { AddressField, FieldErrors } from './address-values'

// Where an address write's errors go (cart digest §7.2, §11.3): every message of a field under
// it, the attr-less `address_*` codes in the form's alert. Pure.

export const MISSING_ADDRESS = 'این آدرس دیگر وجود ندارد.'
/** A province or city the API no longer has: the lists read again, the visitor chooses again. */
export const STALE_CHOICE = 'این گزینه دیگر در دسترس نیست؛ دوباره انتخاب کنید.'
const LIMIT_HINT = 'برای افزودن آدرس تازه، یکی از آدرس‌های قبلی را حذف کنید.'

/**
 * The API's `attr`s the form shows under a field. Any other (`is_default`, which has no message
 * place, or an attr the form does not know) goes to the form's alert: never a silent failure.
 */
const FIELDS: Record<string, AddressField> = {
  title: 'title',
  province: 'province',
  city: 'city',
  address: 'address',
  plaque: 'plaque',
  unit: 'unit',
  postal_code: 'postalCode',
  receiver_first_name: 'firstName',
  receiver_last_name: 'lastName',
  receiver_mobile: 'mobile',
  latitude: 'location',
  longitude: 'location',
}

export interface AddressFailure {
  fields: FieldErrors
  /** For the whole form (`role="alert"`). */
  alert: string | null
  /** `address_city_not_in_province`: the city goes and the lists read again (they are stale). */
  resetCity: boolean
  /** `does_not_exist` on the province or the city: the lists read again. */
  staleGeo: boolean
  /** 404: the address is gone (deleted elsewhere); the list reads again. */
  notFound: boolean
}

const NOTHING: AddressFailure = {
  fields: {},
  alert: null,
  resetCity: false,
  staleGeo: false,
  notFound: false,
}

export function addressFailure(error: unknown): AddressFailure {
  if (!(error instanceof ApiError)) return { ...NOTHING, alert: GENERIC_ERROR_DETAIL }
  // (Not `isApiNotFound(error)`: as a type guard it would leave `error` as `never` below.)
  if (isApiNotFound(error as unknown)) return { ...NOTHING, alert: MISSING_ADDRESS, notFound: true }
  const failure: AddressFailure = { ...NOTHING, fields: {} }
  for (const { code, detail, attr } of error.errors) {
    const field = attr === null ? undefined : FIELDS[attr]
    if (field) {
      const stale = code === 'does_not_exist' && (field === 'province' || field === 'city')
      if (stale) failure.staleGeo = true
      const message = stale ? STALE_CHOICE : detail
      const messages = failure.fields[field] ?? []
      if (!messages.includes(message)) failure.fields[field] = [...messages, message]
      continue
    }
    if (code === 'address_city_not_in_province') failure.resetCity = true
    if (code === 'address_limit_reached') failure.alert = `${detail} ${LIMIT_HINT}`
    else failure.alert ??= detail || null
  }
  if (Object.keys(failure.fields).length === 0) failure.alert ??= error.detail
  return failure
}
