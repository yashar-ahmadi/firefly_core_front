import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotifyMe, RELOAD_SOON } from '@/features/product/components/notify-me'
import { ApiError, NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import { chipsProduct, s25Product } from './fixtures'
import { resetRouter, router } from './router'
import { renderWithProduct } from './support'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', async () => (await import('./router')).routerMock)
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

const SUBMIT = 'موجود شد خبرم کن'
const OK = 'درخواست شما با موفقیت ثبت شد، در صورت موجود شدن کالا به شما اطلاع خواهیم داد.'
const PATH = 'product/detail/chips-pack-family/notify/'
/** «نام (الزامی)», not «نام خانوادگی». */
const FIRST_NAME = /^نام \(/

function refused(code: string, attr: string | null, detail: string, status = 400) {
  return new ApiError({
    status,
    errors: [{ code, attr, detail }],
    ...(status === 503 ? { feature: 'stock_notifications' as const } : {}),
  })
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
  resetRouter()
})

describe('NotifyMe: when it shows (review focus 1)', () => {
  it('stays hidden while the product can be bought, even if the chosen variant cannot', () => {
    const { container } = renderWithProduct(<NotifyMe />, {
      product: s25Product(),
      initialVariantId: 10004,
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden when the stock_notifications switch is off', () => {
    const { container } = renderWithProduct(<NotifyMe />, {
      product: chipsProduct(),
      stockNotifications: false,
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows for a product with nothing to buy, where the buy bar can jump to it', () => {
    const { container } = renderWithProduct(<NotifyMe />, { product: chipsProduct() })
    expect(screen.getByRole('button', { name: SUBMIT })).toBeInTheDocument()
    expect(container.querySelector('#notify-me')).toContainElement(
      screen.getByRole('form', { name: SUBMIT }),
    )
  })
})

describe('NotifyMe for a guest', () => {
  async function fill(mobile: string) {
    const user = userEvent.setup()
    renderWithProduct(<NotifyMe />, { product: chipsProduct() })
    await user.type(screen.getByRole('textbox', { name: FIRST_NAME }), 'سارا')
    await user.type(screen.getByRole('textbox', { name: /نام خانوادگی/ }), 'احمدی')
    await user.type(screen.getByRole('textbox', { name: /شماره موبایل/ }), mobile)
    await user.click(screen.getByRole('button', { name: SUBMIT }))
  }

  it('sends the name and the mobile (Persian digits accepted) and confirms', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    await fill('۰۹۱۲ ۱۲۳ ۴۵۶۷')
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, {
      method: 'POST',
      body: { first_name: 'سارا', last_name: 'احمدی', mobile_number: '09121234567' },
    })
    expect(await screen.findByRole('status')).toHaveTextContent(OK)
    expect(screen.queryByRole('button', { name: SUBMIT })).toBeNull()
  })

  it('refuses a number that is not an Iranian mobile before asking the API', async () => {
    await fill('0912')
    const mobile = screen.getByRole('textbox', { name: /شماره موبایل/ })
    expect(mobile).toHaveAttribute('aria-invalid', 'true')
    expect(mobile).toHaveAccessibleDescription('شماره موبایل معتبر نیست.')
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('asks for the names before sending', async () => {
    const user = userEvent.setup()
    renderWithProduct(<NotifyMe />, { product: chipsProduct() })
    await user.type(screen.getByRole('textbox', { name: /شماره موبایل/ }), '09121234567')
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    expect(screen.getByRole('textbox', { name: FIRST_NAME })).toHaveAccessibleDescription(
      'نام را وارد کنید.',
    )
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it("puts the API's field errors under their fields", async () => {
    mocks.bffFetch.mockRejectedValue(
      refused('invalid', 'mobile_number', 'یک شماره تماس معتبر وارد نمایید.'),
    )
    await fill('09121234567')
    const mobile = screen.getByRole('textbox', { name: /شماره موبایل/ })
    await waitFor(() =>
      expect(mobile).toHaveAccessibleDescription('یک شماره تماس معتبر وارد نمایید.'),
    )
    expect(mobile).toHaveAttribute('aria-invalid', 'true')
  })

  it('asks to reload in a moment when the product is back in stock already', async () => {
    const detail = 'این کالا هم\u{200C}اکنون موجود است و می\u{200C}توانید آن را سفارش دهید.'
    mocks.bffFetch.mockRejectedValue(refused('stock_notification_already_in_stock', null, detail))
    await fill('09121234567')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(detail)
    expect(alert).toHaveTextContent(RELOAD_SOON)
    // A refresh now would read the same cached page (up to a minute old).
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it.each([
    ['no connection', ApiError.network()],
    ['a page that is not the API', ApiError.nonJson(502)],
    ['a redirect from the API', ApiError.upstreamRedirect()],
  ])('says why when the request fails with %s (no field to show it under)', async (_, error) => {
    mocks.bffFetch.mockRejectedValue(error)
    await fill('09121234567')
    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_DETAIL)
    expect(screen.getByRole('button', { name: SUBMIT })).toBeEnabled()
  })

  it('goes away with the reason when the feature was switched off meanwhile', async () => {
    const detail = 'اطلاع\u{200C}رسانی موجود شدن کالا موقتاً غیرفعال است.'
    mocks.bffFetch.mockRejectedValue(refused('feature_disabled', null, detail, 503))
    await fill('09121234567')
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(detail))
    await waitFor(() => expect(screen.queryByRole('button', { name: SUBMIT })).toBeNull())
  })
})

describe('NotifyMe for a signed-in shopper', () => {
  it('asks for the mobile when the account has none (an e-mail account)', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockRejectedValueOnce(
      refused('invalid', 'mobile_number', 'شماره موبایل ضروری است.'),
    )
    renderWithProduct(<NotifyMe />, { product: chipsProduct(), hasSession: true })
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    const mobile = await screen.findByRole('textbox', { name: /شماره موبایل/ })
    expect(mobile).toHaveAccessibleDescription('شماره موبایل ضروری است.')
    expect(screen.queryByRole('textbox', { name: FIRST_NAME })).toBeNull()

    mocks.bffFetch.mockResolvedValueOnce({ data: {}, msg: OK, status: 201 })
    await user.type(mobile, '09121234567')
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    expect(mocks.bffFetch).toHaveBeenLastCalledWith(PATH, {
      method: 'POST',
      body: { mobile_number: '09121234567' },
    })
  })

  it('sends an empty body: the name and mobile come from the account', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    renderWithProduct(<NotifyMe />, { product: chipsProduct(), hasSession: true })
    expect(screen.queryByRole('textbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, { method: 'POST', body: {} })
    expect(await screen.findByRole('status')).toHaveTextContent(OK)
  })

  it('asks for the name when the account has none', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockRejectedValueOnce(refused('invalid', 'first_name', 'نام ضروری است.'))
    renderWithProduct(<NotifyMe />, { product: chipsProduct(), hasSession: true })
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    const first = await screen.findByRole('textbox', { name: FIRST_NAME })
    expect(first).toHaveAccessibleDescription('نام ضروری است.')
    expect(screen.queryByRole('textbox', { name: /شماره موبایل/ })).toBeNull()

    mocks.bffFetch.mockResolvedValueOnce({ data: {}, msg: OK, status: 201 })
    await user.type(first, 'سارا')
    await user.type(screen.getByRole('textbox', { name: /نام خانوادگی/ }), 'احمدی')
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    expect(mocks.bffFetch).toHaveBeenLastCalledWith(PATH, {
      method: 'POST',
      body: { first_name: 'سارا', last_name: 'احمدی' },
    })
  })
})
