import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { callsTo, failure, field, fillNew, renderForm, setUpAddressApi } from './address-support'

// The address form and the API's refusals (cart digest §7.2, §11.3): every message of a field
// under it, the attr-less address_* codes (and anything without a field) in the form's alert,
// stale geography read again.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

const api = setUpAddressApi(mocks.bffFetch)

describe('AddressForm: the API’s errors', () => {
  it('shows the API’s invalid_iranian_mobile under the mobile field, with every other message of it', async () => {
    api.write.mockRejectedValue(
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
    api.write.mockRejectedValue(
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
    api.write.mockRejectedValue(
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
    api.write.mockRejectedValue(
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

  it('address_city_not_in_province also reads the lists again (the cached ones are stale)', async () => {
    api.write.mockRejectedValue(
      failure([
        { code: 'address_city_not_in_province', detail: 'شهر در این استان نیست.', attr: null },
      ]),
    )
    const { user } = renderForm()
    await fillNew(user)
    const before = callsTo(mocks.bffFetch, 'transportation/province/list/').length
    await user.click(field.save())
    await screen.findByRole('alert')
    await waitFor(() =>
      expect(callsTo(mocks.bffFetch, 'transportation/province/list/').length).toBeGreaterThan(
        before,
      ),
    )
  })

  it('an error the form has no field for (is_default, an unknown attr) goes to the alert', async () => {
    api.write.mockRejectedValue(
      failure([
        { code: 'invalid', detail: 'مقدار پیش‌فرض نامعتبر است.', attr: 'is_default' },
        { code: 'invalid', detail: 'فیلد ناشناخته.', attr: 'non_field_errors' },
      ]),
    )
    const { user, onSaved } = renderForm()
    await fillNew(user)
    await user.click(field.save())
    expect(await screen.findByRole('alert')).toHaveTextContent('مقدار پیش‌فرض نامعتبر است.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('coordinates the API refuses: the location button is invalid, described and focused', async () => {
    api.write.mockRejectedValue(
      failure([{ code: 'max_value', detail: 'عرض جغرافیایی نامعتبر است.', attr: 'latitude' }]),
    )
    const { user } = renderForm()
    await fillNew(user)
    await user.click(field.save())
    const location = screen.getByRole('button', { name: 'انتخاب موقعیت روی نقشه' })
    await waitFor(() => expect(location).toHaveAttribute('aria-invalid', 'true'))
    expect(location).toHaveAccessibleDescription(
      expect.stringContaining('عرض جغرافیایی نامعتبر است.'),
    )
    expect(location).toHaveFocus()
  })
})
