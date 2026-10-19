import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SARA } from '../auth/fixtures'
import {
  callsTo,
  chooseRegion,
  field,
  fillNew,
  renderForm,
  SAVED,
  setUpAddressApi,
  written,
} from './address-support'

// The address form, a new address (cart digest §7.2): its fields in the familiar order, digits
// normalised before sending (not the plaque's or the unit's), the city reset with the province,
// the checks before sending, «گیرنده خودم هستم», and the first address as the default.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

const api = setUpAddressApi(mocks.bffFetch)

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
    api.write.mockResolvedValue(written(SAVED, 201))
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
      expect.stringContaining('شمارهٔ موبایل گیرنده را وارد کنید.'),
    )
    expect(field.title()).toHaveFocus()
    expect(api.write).not.toHaveBeenCalled()
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
    api.book = []
    api.write.mockResolvedValue(written({ ...SAVED, is_default: true }, 201))
    const { user } = renderForm()
    await waitFor(() => expect(field.isDefault()).toBeDisabled())
    expect(field.isDefault()).toBeChecked()
    await fillNew(user)
    await user.click(field.save())
    await waitFor(() => expect(api.write).toHaveBeenCalled())
    expect(callsTo(mocks.bffFetch, 'account/address/create/')[0]!.body).toMatchObject({
      is_default: true,
    })
  })

  it('«گیرنده خودم هستم» is not offered (nor ticked) for a profile with nothing to fill', () => {
    renderForm(undefined, {
      me: { ...SARA, first_name: '', last_name: '', full_name: '', phone_number: null },
    })
    expect(screen.queryByRole('checkbox', { name: 'گیرنده خودم هستم' })).toBeNull()
  })

  it('«گیرنده خودم هستم» is not offered for a profile with a phone but no name (it could never read as ticked)', () => {
    renderForm(undefined, {
      me: { ...SARA, first_name: '', last_name: '', full_name: '' },
    })
    expect(SARA.phone_number).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'گیرنده خودم هستم' })).toBeNull()
    expect(field.mobile()).toHaveValue('')
  })

  it('a profile without a phone: another typed mobile is not «myself»', async () => {
    const { user } = renderForm(undefined, { me: { ...SARA, phone_number: null } })
    const self = screen.getByRole('checkbox', { name: 'گیرنده خودم هستم' })
    expect(self).not.toBeChecked()
    await user.click(self)
    expect(field.firstName()).toHaveValue('سارا')
    expect(field.mobile()).toHaveValue('')
    expect(self).toBeChecked()
    await user.type(field.mobile(), '09351112233')
    expect(self).not.toBeChecked()
  })
})
