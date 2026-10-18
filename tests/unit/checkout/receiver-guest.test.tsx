import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { destinationCart, noDestinationCart } from './fixtures'
import { chooseTehran, destinations, renderSection, serve } from './receiver-support'

// «گیرنده و آدرس» for a guest (cart digest §6.6, §7.4): the receiver form, whose province and city
// set the destination at once (a throttled one waits its turn), the postal code required, the
// buyer's mobile optional; without guest checkout, login or registration.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

describe('ReceiverSection, guest', () => {
  it('the form: the destination as soon as the province and city are chosen', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, noDestinationCart())
    renderSection(noDestinationCart(), { hasSession: false })
    await chooseTehran(user)
    await waitFor(() => expect(destinations(mocks.bffFetch)).toEqual([{ province: 8, city: 301 }]))
  })

  it('«ادامه» checks everything the API will: the postal code is required here', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, destinationCart())
    renderSection(destinationCart(), { hasSession: false })
    await user.click(await screen.findByRole('button', { name: 'ادامه' }))
    const postal = screen.getByLabelText(/کد پستی/)
    expect(postal).toHaveAttribute('aria-invalid', 'true')
    expect(postal).toHaveAccessibleDescription(/کد پستی را وارد کنید/)
    expect(screen.getByLabelText(/^نام گیرنده/)).toHaveFocus()
    expect(screen.getByLabelText(/شماره موبایل گیرنده/)).toHaveAttribute('aria-invalid', 'true')
    // The buyer's own number is optional: no error for leaving it out.
    expect(screen.getByLabelText(/پیگیری سفارش/)).not.toHaveAttribute('aria-invalid')
  })

  it('a full form moves on (the receiver kept for placement)', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, destinationCart())
    renderSection(destinationCart(), { hasSession: false })
    await chooseTehran(user)
    await user.type(screen.getByLabelText(/^نام گیرنده/), 'سارا')
    await user.type(screen.getByLabelText(/نام خانوادگی گیرنده/), 'احمدی')
    await user.type(screen.getByLabelText(/شماره موبایل گیرنده/), '۰۹۱۲۱۲۳۴۵۰۱')
    await user.type(screen.getByLabelText(/آدرس کامل/), 'خیابان ولیعصر')
    await user.type(screen.getByLabelText(/کد پستی/), '۱۲۳۴۵۶۷۸۹۰')
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() =>
      expect(JSON.parse(sessionStorage.getItem('ff-checkout-receiver')!)).toMatchObject({
        confirmed: true,
      }),
    )
  })

  it('without guest checkout: log in or register to go on, both coming back here', async () => {
    serve(mocks.bffFetch, noDestinationCart())
    renderSection(noDestinationCart(), {
      hasSession: false,
      features: {
        guest_checkout: { key: 'guest_checkout', name: 'خرید مهمان', enabled: false, reason: null },
      },
    })
    expect(
      await screen.findByText('برای ادامه\u{0654} خرید وارد حساب کاربری شوید'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ورود به حساب کاربری' })).toHaveAttribute(
      'href',
      '/login/?next=/checkout/',
    )
    expect(screen.getByRole('link', { name: 'ثبت‌نام' })).toHaveAttribute(
      'href',
      '/register/?next=%2Fcheckout%2F',
    )
    expect(screen.queryByLabelText(/^نام گیرنده/)).not.toBeInTheDocument()
  })

  it('a throttled destination (429): said calmly, «ادامه» waits out `retry_after`', async () => {
    const user = userEvent.setup()
    const throttled = new ApiError({ status: 429, code: 'throttled', detail: '…', retryAfter: 30 })
    serve(mocks.bffFetch, noDestinationCart(), [], () => Promise.reject(throttled))
    renderSection(noDestinationCart(), { hasSession: false })
    await chooseTehran(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('لطفاً کمی بعد دوباره تلاش کنید.')
    const next = screen.getByRole('button', { name: 'ادامه' })
    await waitFor(() => expect(next).toHaveAttribute('aria-disabled', 'true'))
    expect(next).toHaveAccessibleDescription(/زمان باقی‌مانده تا تلاش دوباره/)
  })
})
