import { describe, expect, it } from 'vitest'
import {
  addressFailure,
  MISSING_ADDRESS,
  STALE_CHOICE,
} from '@/features/account/addresses/address-errors'
import {
  checkAddress,
  createBody,
  patchBody,
  valuesFrom,
  type AddressValues,
} from '@/features/account/addresses/address-values'
import { ApiError } from '@/lib/api/errors'
import { HOME, WORK } from './address-fixtures'

// The address form's model (cart digest §7.2): what it sends on create and on edit, what it
// checks before sending, and where the API's errors go.

const NEW: AddressValues = {
  ...valuesFrom(),
  title: ' خانه ',
  province: 8,
  city: 301,
  address: ' خیابان ولیعصر، کوچه نگار ',
  plaque: '۱۲ب',
  unit: '۴/۱',
  postalCode: '۱۲۳۴۵-۶۷۸۹۰',
  firstName: 'سارا',
  lastName: 'احمدی',
  mobile: '۰۹۱۲ ۱۲۳ ۴۵۶۷',
}

describe('createBody', () => {
  it('sends Latin digits for the mobile and the postal code, plaque and unit as typed', () => {
    expect(createBody(NEW)).toEqual({
      title: 'خانه',
      province: 8,
      city: 301,
      address: 'خیابان ولیعصر، کوچه نگار',
      plaque: '۱۲ب',
      unit: '۴/۱',
      postal_code: '1234567890',
      receiver_first_name: 'سارا',
      receiver_last_name: 'احمدی',
      receiver_mobile: '09121234567',
      is_default: false,
    })
  })

  it('sends both coordinates or neither, and "" for no postal code (never null)', () => {
    const body = createBody({
      ...NEW,
      postalCode: '',
      plaque: '',
      unit: ' ',
      location: { latitude: 35.689198, longitude: 51.389 },
    })
    expect(body).toMatchObject({ postal_code: '', latitude: 35.689198, longitude: 51.389 })
    expect(body).not.toHaveProperty('plaque')
    expect(body).not.toHaveProperty('unit')
    expect(createBody(NEW)).not.toHaveProperty('latitude')
    expect(createBody(NEW)).not.toHaveProperty('longitude')
  })
})

describe('patchBody', () => {
  const home = valuesFrom(HOME)

  it('reads the address back as the form shows it: the mobile as 09…, the pin as one point', () => {
    expect(home).toMatchObject({
      mobile: '09121234501',
      plaque: '۱۲',
      location: { latitude: 35.7564, longitude: 51.41 },
      isDefault: true,
    })
    expect(valuesFrom(WORK).location).toBeNull()
  })

  it('sends nothing when nothing changed (another spelling of the same number is no change)', () => {
    expect(patchBody(home, HOME)).toEqual({})
    expect(
      patchBody({ ...home, mobile: '+98 912 123 4501', postalCode: '19697-34563' }, HOME),
    ).toEqual({})
  })

  it('sends only what changed', () => {
    expect(patchBody({ ...home, title: 'منزل' }, HOME)).toEqual({ title: 'منزل' })
    expect(patchBody({ ...home, mobile: '۰۹۳۵۱۱۱۲۲۳۳' }, HOME)).toEqual({
      receiver_mobile: '09351112233',
    })
    expect(patchBody({ ...home, plaque: '' }, HOME)).toEqual({ plaque: null })
    expect(patchBody({ ...home, postalCode: '' }, HOME)).toEqual({ postal_code: '' })
    expect(patchBody({ ...home, isDefault: false }, HOME)).toEqual({ is_default: false })
  })

  it('sends the province and the city together when either changed', () => {
    expect(patchBody({ ...home, city: 313 }, HOME)).toEqual({ province: 8, city: 313 })
    expect(patchBody({ ...home, province: 4, city: 127 }, HOME)).toEqual({ province: 4, city: 127 })
  })

  it('sends both coordinates when the pin moved, and both null when it was removed', () => {
    expect(patchBody({ ...home, location: { latitude: 35.7, longitude: 51.41 } }, HOME)).toEqual({
      latitude: 35.7,
      longitude: 51.41,
    })
    expect(patchBody({ ...home, location: null }, HOME)).toEqual({
      latitude: null,
      longitude: null,
    })
  })
})

describe('checkAddress', () => {
  it('passes a complete address (the postal code is optional)', () => {
    expect(checkAddress(NEW)).toEqual({})
    expect(checkAddress({ ...NEW, postalCode: '' })).toEqual({})
  })

  it('names every missing field and every bad value, as the API would', () => {
    expect(checkAddress(valuesFrom())).toEqual({
      title: ['عنوان آدرس را وارد کنید.'],
      province: ['استان را انتخاب کنید.'],
      city: ['شهر را انتخاب کنید.'],
      address: ['نشانی کامل را وارد کنید.'],
      firstName: ['نام گیرنده را وارد کنید.'],
      lastName: ['نام خانوادگی گیرنده را وارد کنید.'],
      mobile: ['شماره موبایل گیرنده را وارد کنید.'],
    })
    expect(
      checkAddress({
        ...NEW,
        title: 'ع'.repeat(51),
        plaque: '۱'.repeat(21),
        postalCode: '۱۲۳۴۵۶۷۸۹',
        mobile: '02188776655',
      }),
    ).toEqual({
      title: ['عنوان آدرس حداکثر ۵۰ نویسه است.'],
      plaque: ['پلاک حداکثر ۲۰ نویسه است.'],
      postalCode: ['کد پستی باید ۱۰ رقم باشد.'],
      mobile: ['شمارهٔ موبایل ایران را وارد کنید؛ مانند ۰۹۱۲۱۲۳۴۵۶۷.'],
    })
  })
})

const fromBody = (
  status: number,
  errors: Array<{ code: string; detail: string; attr: string | null }>,
) =>
  ApiError.fromBody(status, {
    msg: 'خطا',
    data: {
      type: errors.some((error) => error.attr) ? 'validation_error' : 'client_error',
      errors,
    },
  })

describe('addressFailure', () => {
  it('puts every message of a field under it (a partial mobile has two)', () => {
    const failure = addressFailure(
      fromBody(400, [
        { code: 'invalid', detail: 'شماره تماس وارد شده معتبر نیست.', attr: 'receiver_mobile' },
        {
          code: 'invalid_iranian_mobile',
          detail: 'شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی‌شود.',
          attr: 'receiver_mobile',
        },
        { code: 'max_length', detail: 'پلاک طولانی است.', attr: 'plaque' },
      ]),
    )
    expect(failure.fields).toEqual({
      mobile: [
        'شماره تماس وارد شده معتبر نیست.',
        'شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی‌شود.',
      ],
      plaque: ['پلاک طولانی است.'],
    })
    expect(failure.alert).toBeNull()
  })

  it('the attr-less address_* codes go to the form’s alert; a city of another province resets it', () => {
    const limit = addressFailure(
      fromBody(400, [
        {
          code: 'address_limit_reached',
          detail: 'حداکثر تعداد آدرس‌های قابل ثبت 10 عدد است.',
          attr: null,
        },
      ]),
    )
    expect(limit.alert).toBe(
      'حداکثر تعداد آدرس‌های قابل ثبت 10 عدد است. برای افزودن آدرس تازه، یکی از آدرس‌های قبلی را حذف کنید.',
    )
    const city = addressFailure(
      fromBody(400, [
        { code: 'address_city_not_in_province', detail: 'شهر در این استان نیست.', attr: null },
      ]),
    )
    expect(city).toMatchObject({ alert: 'شهر در این استان نیست.', resetCity: true, fields: {} })
  })

  it('a province or city the API no longer has: the lists reload, the field asks again', () => {
    const failure = addressFailure(
      fromBody(400, [
        { code: 'does_not_exist', detail: 'موردی با شناسهٔ «999» یافت نشد.', attr: 'city' },
      ]),
    )
    expect(failure).toMatchObject({ staleGeo: true, fields: { city: [STALE_CHOICE] } })
  })

  it('an address gone meanwhile (404): «این آدرس دیگر وجود ندارد», never «access denied»', () => {
    const failure = addressFailure(
      fromBody(404, [{ code: 'not_found', detail: 'یافت نشد.', attr: null }]),
    )
    expect(failure).toMatchObject({ alert: MISSING_ADDRESS, notFound: true })
  })

  it('anything else: the API’s sentence, or the generic one', () => {
    expect(addressFailure(ApiError.network()).alert).toBe(
      'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.',
    )
    expect(addressFailure(new Error('boom')).alert).toBe('خطایی رخ داد. لطفاً دوباره تلاش کنید.')
  })
})
