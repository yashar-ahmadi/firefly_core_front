import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CancelDialog } from '@/features/orders/account/cancel-dialog'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { calls, detail, ok, refuse, renderAccount, serve } from './account-support'

// «لغو سفارش» of an account order (order digest §3.1.4, §8.2): the question starts on «بازگشت»,
// the optional reason (≤ 500) is sent trimmed, one request however fast the presses. 200 → the
// API's order to the page, said once (with «درخواست بازگشت وجه ثبت شد و پشتیبانی آن را انجام
// می‌دهد» when money was settled: never "refunded"). Each refusal said in the dialog; those that
// mean the page is out of date read the order again and leave only «بازگشت».

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/account/orders/3067562358/',
}))

const CODE = '3067562358'
const CANCEL = `order/${CODE}/cancel/`
const cancelled = (settled = 0) => {
  const order = detail('awaiting', { status: 'cancelled', can_cancel: false, is_payable: false })
  return { ...order, money: { ...order.money, amount_settled_online: settled } }
}

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  serve(mocks.bffFetch, { [CANCEL]: () => ok(cancelled()) })
})

function renderDialog() {
  const props = { onOpenChange: vi.fn(), onCancelled: vi.fn(), onStale: vi.fn() }
  renderAccount(<CancelDialog code={CODE} open {...props} />)
  return { ...props, user: userEvent.setup() }
}

const dialog = () => screen.getByRole('dialog', { name: 'لغو سفارش' })
const confirm = () => within(dialog()).getByRole('button', { name: /لغو سفارش|در حال لغو/ })
const sent = () => calls(mocks.bffFetch, CANCEL).map(([, init]) => (init as { body: unknown }).body)

describe('the question', () => {
  it('starts on «بازگشت», which sends nothing', async () => {
    const { user, onOpenChange } = renderDialog()
    const back = within(dialog()).getByRole('button', { name: 'بازگشت' })
    expect(back).toHaveFocus()
    await user.click(back)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(sent()).toHaveLength(0)
  })

  it('sends the reason trimmed (nothing when empty), once however fast the presses', async () => {
    let answer: (value: unknown) => void = () => {}
    serve(mocks.bffFetch, { [CANCEL]: () => new Promise((resolve) => (answer = resolve)) })
    const { user } = renderDialog()
    await user.type(
      within(dialog()).getByRole('textbox', { name: /دلیل لغو/ }),
      '  دیگر لازم نیست ',
    )
    await user.dblClick(confirm())
    await user.click(confirm())
    expect(sent()).toEqual([{ reason: 'دیگر لازم نیست' }])
    expect(confirm()).toHaveAttribute('aria-busy', 'true')
    answer({ data: cancelled(), msg: '', status: 200 })
  })
})

describe('cancelled', () => {
  it('the API’s order goes to the page, the dialog closes, and it is said once', async () => {
    const { user, onCancelled, onOpenChange } = renderDialog()
    await user.click(confirm())
    expect(sent()).toEqual([{}])
    expect(onCancelled).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.announce).toHaveBeenCalledWith('سفارش لغو شد.')
  })

  it('money already settled: a refund request is said to be registered, never "refunded"', async () => {
    serve(mocks.bffFetch, { [CANCEL]: () => ok(cancelled(50_000)) })
    const { user } = renderDialog()
    await user.click(confirm())
    const said = mocks.announce.mock.calls.map(([text]) => String(text)).join(' ')
    expect(said).toContain('درخواست بازگشت وجه ثبت شد و پشتیبانی آن را انجام می\u{200C}دهد')
    expect(said).not.toMatch(/بازگردانده شد|بازپرداخت شد/)
  })
})

describe('refused', () => {
  it.each([
    [409, 'order_already_cancelled', 'این سفارش پیش‌تر لغو شده است.'],
    [409, 'order_cancellation_not_allowed', 'برای لغو آن با پشتیبانی تماس بگیرید'],
    [404, 'not_found', 'سفارش پیدا نشد.'],
    // A receipt in the queue: the order is under review now (§6.1), not what the page shows.
    [409, 'order_receipt_pending', 'رسید پرداخت این سفارش در حال بررسی است'],
  ])('%i %s: said, the order read again, only «بازگشت» left', async (status, code, text) => {
    serve(mocks.bffFetch, { [CANCEL]: () => refuse(status, code) })
    const { user, onStale, onCancelled } = renderDialog()
    await user.click(confirm())
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(text)
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(onCancelled).not.toHaveBeenCalled()
    expect(within(dialog()).queryByRole('button', { name: 'لغو سفارش' })).toBeNull()
    expect(within(dialog()).getByRole('button', { name: 'بازگشت' })).toHaveFocus()
  })

  it('the reason’s own error goes under it', async () => {
    serve(mocks.bffFetch, {
      [CANCEL]: () =>
        Promise.reject(
          ApiError.fromBody(400, {
            data: {
              type: 'validation_error',
              errors: [{ code: 'max_length', detail: 'حداکثر ۵۰۰ نویسه.', attr: 'reason' }],
            },
          }),
        ),
    })
    const { user } = renderDialog()
    await user.click(confirm())
    expect(within(dialog()).getByRole('textbox', { name: /دلیل لغو/ })).toHaveAccessibleDescription(
      /حداکثر ۵۰۰ نویسه\./,
    )
  })

  it('429: the wait on the button; nothing sent while it runs', async () => {
    serve(mocks.bffFetch, { [CANCEL]: () => refuse(429, 'throttled', 'زیاد', { retry_after: 30 }) })
    const { user } = renderDialog()
    await user.click(confirm())
    expect(within(dialog()).getByText(/زمان باقی‌مانده تا تلاش دوباره/)).toBeVisible()
    await user.click(confirm())
    expect(sent()).toHaveLength(1)
  })
})
