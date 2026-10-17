import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressForm } from '@/features/account/addresses/address-form'
import type { Address } from '@/lib/api/types/address'
import { stubBrowserApis } from '../support/dom-stubs'
import { HOME, WORK } from './address-fixtures'
import {
  callsTo,
  failure,
  field,
  renderSignedIn,
  stubApi,
  written,
  type ApiStub,
} from './address-support'

// The address form (cart digest §7.2): its fields in the familiar order, digits normalised
// before sending (not the plaque's or the unit's), the city reset with the province, the API's
// field errors under their fields (all of them), its attr-less address_* codes in the form's
// alert, edits as a PATCH of what changed, and the coordinates both or neither.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

let book: Address[]
let write: ReturnType<typeof vi.fn<ApiStub['write']>>

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  book = [HOME, WORK]
  write = vi.fn<ApiStub['write']>()
  stubApi(mocks.bffFetch, {
    get book() {
      return book
    },
    write,
  })
})

const SAVED: Address = { ...WORK, id: 10050, title: 'منزل پدری', is_default: false }

function renderForm(initial?: Address) {
  const onSaved = vi.fn()
  const view = renderSignedIn(<AddressForm initial={initial} onSaved={onSaved} />)
  return { onSaved, ...view }
}

async function chooseRegion(user: UserEvent, province = 'تهران', city = 'شهریار') {
  await waitFor(() =>
    expect(within(field.province()).getByRole('option', { name: province })).toBeInTheDocument(),
  )
  await user.selectOptions(field.province(), province)
  await waitFor(() => expect(field.city()).toBeEnabled())
  await user.selectOptions(field.city(), city)
}

/** A complete new address, typed with Persian digits where people use them. */
async function fillNew(user: UserEvent) {
  await user.type(field.title(), 'منزل پدری')
  await chooseRegion(user)
  await user.type(field.address(), 'خیابان امام، کوچه یاس')
  await user.type(field.plaque(), '۱۲ب')
  await user.type(field.unit(), '۳')
  await user.type(field.postalCode(), '۱۲۳۴۵-۶۷۸۹۰')
  await user.type(field.firstName(), 'مریم')
  await user.type(field.lastName(), 'رضایی')
  await user.type(field.mobile(), '۰۹۱۲۱۲۳۴۵۶۷')
}

describe('AddressForm: a new address', () => {
  it('lists the fields in the familiar order', async () => {
    renderForm()
    const names = [
      field.title(),
      field.province(),
      field.city(),
      field.address(),
      field.plaque(),
      field.unit(),
      field.postalCode(),
      screen.getByRole('checkbox', { name: 'گیرنده خودم هستم' }),
      field.firstName(),
      field.lastName(),
      field.mobile(),
      screen.getByRole('button', { name: 'انتخاب موقعیت روی نقشه' }),
      field.isDefault(),
      field.save(),
    ]
    for (let index = 1; index < names.length; index++) {
      expect(
        names[index - 1]!.compareDocumentPosition(names[index]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${index}`,
      ).toBeTruthy()
    }
    expect(field.mobile()).toHaveAttribute('inputmode', 'numeric')
    expect(field.mobile()).toHaveAttribute('autocomplete', 'tel')
    expect(field.postalCode()).toHaveAttribute('inputmode', 'numeric')
    expect(field.postalCode()).toHaveAttribute('autocomplete', 'postal-code')
    expect(field.address()).toHaveAttribute('autocomplete', 'street-address')
    // The city waits for a province.
    expect(field.city()).toBeDisabled()
  })

  it('normalises «۰۹۱۲۱۲۳۴۵۶۷» and the postal code to Latin digits; plaque and unit stay as typed', async () => {
    write.mockResolvedValue(written(SAVED, 201))
    const { user, onSaved } = renderForm()
    await fillNew(user)
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED))
    const [create] = callsTo(mocks.bffFetch, 'account/address/create/')
    expect(create).toMatchObject({ method: 'POST' })
    expect(create!.body).toEqual({
      title: 'منزل پدری',
      province: 8,
      city: 313,
      address: 'خیابان امام، کوچه یاس',
      plaque: '۱۲ب',
      unit: '۳',
      postal_code: '1234567890',
      receiver_first_name: 'مریم',
      receiver_last_name: 'رضایی',
      receiver_mobile: '09121234567',
      is_default: false,
    })
    // Neither coordinate without a pin (never 0,0).
    expect(create!.body).not.toHaveProperty('latitude')
    expect(create!.body).not.toHaveProperty('longitude')
  })

  it('clears the city when the province changes', async () => {
    const { user } = renderForm()
    await chooseRegion(user, 'تهران', 'شهریار')
    expect(field.city()).toHaveValue('313')
    await user.selectOptions(field.province(), 'اصفهان')
    expect(field.city()).toHaveValue('')
    await waitFor(() =>
      expect(within(field.city()).getByRole('option', { name: 'کاشان' })).toBeInTheDocument(),
    )
    expect(within(field.city()).queryByRole('option', { name: 'شهریار' })).toBeNull()
  })

  it('checks before sending: every missing field said, the first one focused, nothing sent', async () => {
    const { user } = renderForm()
    await user.click(field.save())
    expect(field.title()).toHaveAttribute('aria-invalid', 'true')
    expect(field.title()).toHaveAccessibleDescription('عنوان آدرس را وارد کنید.')
    expect(field.mobile()).toHaveAccessibleDescription(
      expect.stringContaining('شماره موبایل گیرنده را وارد کنید.'),
    )
    expect(field.title()).toHaveFocus()
    expect(write).not.toHaveBeenCalled()
  })

  it('shows the API’s invalid_iranian_mobile under the mobile field, with every other message of it', async () => {
    write.mockRejectedValue(
      failure([
        { code: 'invalid', detail: 'شماره تماس وارد شده معتبر نیست.', attr: 'receiver_mobile' },
        {
          code: 'invalid_iranian_mobile',
          detail: 'شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی‌شود.',
          attr: 'receiver_mobile',
        },
      ]),
    )
    const { user, onSaved } = renderForm()
    await fillNew(user)
    await user.click(field.save())
    await waitFor(() => expect(field.mobile()).toHaveAttribute('aria-invalid', 'true'))
    expect(field.mobile()).toHaveAccessibleDescription(
      expect.stringContaining(
        'شماره تماس وارد شده معتبر نیست. شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی‌شود.',
      ),
    )
    expect(field.mobile()).toHaveFocus()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('address_city_not_in_province: the form’s alert, and the city goes', async () => {
    write.mockRejectedValue(
      failure([
        {
          code: 'address_city_not_in_province',
          detail: 'شهر انتخاب‌شده متعلق به استان انتخاب‌شده نیست.',
          attr: null,
        },
      ]),
    )
    const { user } = renderForm()
    await fillNew(user)
    await user.click(field.save())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'شهر انتخاب‌شده متعلق به استان انتخاب‌شده نیست.',
    )
    expect(field.city()).toHaveValue('')
    expect(field.province()).toHaveValue('8')
  })

  it('address_limit_reached: the API’s sentence and the way out (never a hard-coded limit)', async () => {
    write.mockRejectedValue(
      failure([
        {
          code: 'address_limit_reached',
          detail: 'حداکثر تعداد آدرس‌های قابل ثبت 10 عدد است.',
          attr: null,
        },
      ]),
    )
    const { user } = renderForm()
    await fillNew(user)
    await user.click(field.save())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'حداکثر تعداد آدرس‌های قابل ثبت 10 عدد است. برای افزودن آدرس تازه، یکی از آدرس‌های قبلی را حذف کنید.',
    )
  })

  it('a city the API no longer has: the lists read again, the city asks again', async () => {
    write.mockRejectedValue(
      failure([
        { code: 'does_not_exist', detail: 'موردی با شناسهٔ «313» یافت نشد.', attr: 'city' },
      ]),
    )
    const { user } = renderForm()
    await fillNew(user)
    const before = callsTo(mocks.bffFetch, 'transportation/province/list/').length
    await user.click(field.save())
    await waitFor(() =>
      expect(field.city()).toHaveAccessibleDescription(
        expect.stringContaining('این گزینه دیگر در دسترس نیست؛ دوباره انتخاب کنید.'),
      ),
    )
    expect(field.city()).toHaveValue('')
    await waitFor(() =>
      expect(callsTo(mocks.bffFetch, 'transportation/province/list/').length).toBeGreaterThan(
        before,
      ),
    )
  })

  it('«گیرنده خودم هستم» fills the receiver from the profile', async () => {
    const { user } = renderForm()
    await user.click(screen.getByRole('checkbox', { name: 'گیرنده خودم هستم' }))
    expect(field.firstName()).toHaveValue('سارا')
    expect(field.lastName()).toHaveValue('احمدی')
    expect(field.mobile()).toHaveValue('09121234501')
    // Another receiver typed: no longer «myself».
    await user.type(field.firstName(), 'ء')
    expect(screen.getByRole('checkbox', { name: 'گیرنده خودم هستم' })).not.toBeChecked()
  })

  it('the first address is the default: the switch is on and cannot be turned off', async () => {
    book = []
    write.mockResolvedValue(written({ ...SAVED, is_default: true }, 201))
    const { user } = renderForm()
    await waitFor(() => expect(field.isDefault()).toBeDisabled())
    expect(field.isDefault()).toBeChecked()
    await fillNew(user)
    await user.click(field.save())
    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(callsTo(mocks.bffFetch, 'account/address/create/')[0]!.body).toMatchObject({
      is_default: true,
    })
  })
})

describe('AddressForm: an edit', () => {
  it('sends a PATCH of what changed only, to …/update/', async () => {
    write.mockResolvedValue(written({ ...HOME, title: 'منزل' }))
    const { user, onSaved } = renderForm(HOME)
    expect(field.title()).toHaveValue('خانه')
    expect(field.mobile()).toHaveValue('09121234501')
    await user.clear(field.title())
    await user.type(field.title(), 'منزل')
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsTo(mocks.bffFetch, `account/address/${HOME.id}/update/`)).toEqual([
      expect.objectContaining({ method: 'PATCH', body: { title: 'منزل' } }),
    ])
  })

  it('sends the province and the city together when the city changed', async () => {
    write.mockResolvedValue(written({ ...HOME, city: 313, city_name: 'شهریار' }))
    const { user, onSaved } = renderForm(HOME)
    await waitFor(() => expect(field.city()).toHaveValue('301'))
    await user.selectOptions(field.city(), 'شهریار')
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsTo(mocks.bffFetch, `account/address/${HOME.id}/update/`)[0]!.body).toEqual({
      province: 8,
      city: 313,
    })
  })

  it('removing the pin sends both coordinates as null (never one alone)', async () => {
    write.mockResolvedValue(written({ ...HOME, latitude: null, longitude: null }))
    const { user, onSaved } = renderForm(HOME)
    await user.click(screen.getByRole('button', { name: 'حذف موقعیت' }))
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callsTo(mocks.bffFetch, `account/address/${HOME.id}/update/`)[0]!.body).toEqual({
      latitude: null,
      longitude: null,
    })
  })

  it('nothing changed: nothing sent', async () => {
    const { user, onSaved } = renderForm(WORK)
    await user.click(field.save())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(WORK))
    expect(write).not.toHaveBeenCalled()
  })

  it('the only address stays the default: its switch is on and cannot be turned off', async () => {
    book = [HOME]
    renderForm(HOME)
    await waitFor(() => expect(field.isDefault()).toBeDisabled())
    expect(field.isDefault()).toBeChecked()
  })

  it('the default of a larger book may be turned off (the API promotes another)', async () => {
    renderForm(HOME)
    await waitFor(() => expect(field.isDefault()).toBeEnabled())
    expect(field.isDefault()).toBeChecked()
  })

  it('an address deleted meanwhile (404): «این آدرس دیگر وجود ندارد»', async () => {
    write.mockRejectedValue(failure([{ code: 'not_found', detail: 'یافت نشد.', attr: null }], 404))
    const { user } = renderForm(WORK)
    await user.clear(field.title())
    await user.type(field.title(), 'دفتر')
    await user.click(field.save())
    expect(await screen.findByRole('alert')).toHaveTextContent('این آدرس دیگر وجود ندارد.')
  })
})
