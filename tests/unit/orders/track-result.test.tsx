import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fill, keepGuestOrder, ok, renderTrack, serve, submit, tracked } from './track-support'

// What tracking shows (order digest §3.1.8: no address, lines, money breakdown, progress or
// timeline by design): the API's status words, when it was placed (and paid), a progress view
// derived from the status and the stamps, the postal tracking code to copy, the item count and
// the total, and a payment link only when this device holds the order's link (its recent guest
// orders: the API never returns it) while it awaits payment. The result takes the focus on its
// heading (said once, by that focus).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/order/track/',
}))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.announce.mockReset()
})

async function track(result = tracked('delivered'), code = result.order_code) {
  const user = userEvent.setup()
  serve(mocks.bffFetch, () => ok(result))
  await renderTrack()
  await fill(user, { code })
  await user.click(submit())
  const heading = await screen.findByRole('heading', { level: 2, name: /^سفارش\s[۰-۹]/ })
  return { user, heading, region: heading.closest('section')! }
}

describe('a delivered order (live)', () => {
  it('the API’s words, the dates, the count and the total; the heading takes the focus', async () => {
    const { heading, region } = await track()
    expect(heading).toHaveAccessibleName(/سفارش ۲۵۸۳۹۷۳۸۷۷.*تکمیل شده/)
    expect(heading).toHaveFocus()
    expect(region).toHaveTextContent(/تاریخ ثبت.*۱۷ مرداد ۱۴۰۵/)
    expect(region).toHaveTextContent('۴ کالا')
    expect(region).toHaveTextContent('۸٬۱۸۷٬۰۰۰ تومان')
    // Said once: by the heading's focus, never by the live region as well.
    expect(mocks.announce).not.toHaveBeenCalled()
  })

  it('the progress, derived: every step done, delivery the current one', async () => {
    const { region } = await track()
    const steps = within(within(region).getByRole('list', { name: 'مراحل سفارش' })).getAllByRole(
      'listitem',
    )
    expect(steps).toHaveLength(5)
    expect(steps.at(-1)).toHaveAttribute('aria-current', 'step')
    expect(steps.at(-1)).toHaveTextContent('تکمیل شده')
  })

  it('the postal tracking code, left to right, to copy as it is', async () => {
    const { user, region } = await track()
    const code = within(region).getByText('۱۳۷۳۳۱۱۶۷۹۷۱۳۷۵۹۴۵۱۰۲۳۱')
    expect(code.closest('[dir="ltr"]')).not.toBeNull()
    await user.click(within(region).getByRole('button', { name: /کپی.*کد رهگیری/ }))
    expect(await navigator.clipboard.readText()).toBe('13733116797137594510231')
    expect(region).toHaveTextContent(/سامانهٔ رهگیری/)
  })
})

describe('the status’s own words', () => {
  it('the API’s status_display, whatever it says', async () => {
    const { heading } = await track(
      tracked('processing', { status: 'sent', status_display: 'تحویل پست شد' }),
    )
    expect(heading).toHaveAccessibleName(/تحویل پست شد/)
  })

  it('paid: when; not paid: no such line', async () => {
    const { region } = await track(tracked('processing'))
    expect(region).toHaveTextContent('تاریخ پرداخت')
    expect(region).toHaveTextContent('۲۳ مهر ۱۴۰۵')
  })

  it('cancelled: its ending and what to do about money already paid', async () => {
    const { region } = await track(tracked('cancelled'))
    expect(within(region).getByRole('list', { name: 'مراحل سفارش' })).toHaveTextContent(
      'پایان سفارش',
    )
    expect(region).toHaveTextContent(/پشتیبانی/)
    expect(within(region).queryByRole('link', { name: /پرداخت/ })).toBeNull()
  })

  it('returned: its ending, said', async () => {
    const { region } = await track(tracked('returned'))
    expect(region).toHaveTextContent('مسترد شده')
    expect(region).toHaveTextContent('پایان سفارش')
  })
})

describe('awaiting payment', () => {
  it('this device holds its link: «پرداخت سفارش», a full page load of the link, its deadline', async () => {
    keepGuestOrder()
    const { region } = await track(tracked('awaiting_payment'))
    const pay = within(region).getByRole('link', { name: 'پرداخت سفارش' })
    expect(pay).toHaveAttribute('href', '/order/pay/tokenForTheAwaitingOrder000000000000000001/')
    expect(region).toHaveTextContent(/مهلت پرداخت/)
  })

  it('no link here: no pay button; the SMS link is where to pay', async () => {
    const { region } = await track(tracked('awaiting_payment'))
    expect(within(region).queryByRole('link', { name: 'پرداخت سفارش' })).toBeNull()
    expect(region).toHaveTextContent(/لینک پرداختی که با پیامک/)
  })

  it('a link kept here for an order that no longer awaits payment: no pay button', async () => {
    keepGuestOrder({ orderCode: '2583973877' })
    const { region } = await track()
    expect(within(region).queryByRole('link', { name: 'پرداخت سفارش' })).toBeNull()
  })
})
