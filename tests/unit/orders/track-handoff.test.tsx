import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contextOf, savePlaced } from '@/features/checkout/placed-order'
import { ThanksPage } from '@/features/checkout/thanks/thanks-page'
import { clearOrderCodeHandoff, peekOrderCode } from '@/features/orders/track/track-handoff'
import { TrackLink } from '@/features/orders/track/track-link'
import { TransferActions } from '@/features/payment/card-transfer/transfer-actions'
import { PayLinkRefusal } from '@/features/payment/pay-link-refusal'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { placement } from '../payment/fixtures'
import { codeField, keepGuestOrder, mobileField, renderTrack, serve } from './track-support'

// Into tracking with the order's code (Plan 4 Task 7): the pages that send a shopper to
// `/order/track/` (the thanks page, the payment link's refusals, the payment result, the card
// transfer) hand the code over in this tab's session storage (in memory too), never in the URL:
// the code and the mobile together are a lookup key. The tracking page takes it once (the form
// starts with it, the mobile still to type) and forgets it. A link opened elsewhere (a new tab)
// hands nothing.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/order/track/',
}))

stubBrowserApis()

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  clearOrderCodeHandoff()
  mocks.bffFetch.mockReset()
  serve(mocks.bffFetch)
})

/** Clicks `link` as a visitor does, without the browser following it. */
async function click(link: HTMLElement, init?: { ctrlKey?: boolean }) {
  link.addEventListener('click', (event) => event.preventDefault(), { once: true })
  const user = userEvent.setup()
  if (init?.ctrlKey) await user.keyboard('{Control>}')
  await user.click(link)
  if (init?.ctrlKey) await user.keyboard('{/Control}')
}

describe('TrackLink', () => {
  it('hands the code over: the URL is the bare page, the form starts with the code', async () => {
    const { unmount } = render(<TrackLink orderCode="2583973877">پیگیری سفارش</TrackLink>)
    const link = screen.getByRole('link', { name: 'پیگیری سفارش' })
    expect(link).toHaveAttribute('href', '/order/track/')
    await click(link)
    expect(peekOrderCode()).toBe('2583973877')
    expect(JSON.stringify(sessionStorage)).not.toContain('09')
    unmount()
    await renderTrack()
    expect(codeField()).toHaveValue('2583973877')
    expect(mobileField()).toHaveValue('')
    // Taken: the next visit starts empty.
    expect(peekOrderCode()).toBe('')
  })

  it('opened in a new tab (a modified click): nothing handed', async () => {
    render(<TrackLink orderCode="2583973877">پیگیری سفارش</TrackLink>)
    await click(screen.getByRole('link'), { ctrlKey: true })
    expect(peekOrderCode()).toBe('')
  })

  it('from a payment link’s page: the code found by its token in this device’s guest orders', async () => {
    keepGuestOrder()
    render(
      <TrackLink linkToken="tokenForTheAwaitingOrder000000000000000001">پیگیری سفارش</TrackLink>,
    )
    await click(screen.getByRole('link'))
    expect(peekOrderCode()).toBe('3067562358')
  })

  it('nothing known: nothing handed, and the page starts empty', async () => {
    render(<TrackLink linkToken="unknown">پیگیری سفارش</TrackLink>)
    await click(screen.getByRole('link'))
    expect(peekOrderCode()).toBe('')
  })

  it('a code of the wrong shape is never handed', async () => {
    render(<TrackLink orderCode="12">پیگیری سفارش</TrackLink>)
    await click(screen.getByRole('link'))
    expect(peekOrderCode()).toBe('')
  })
})

describe('the doors into tracking', () => {
  it('the thanks page hands its order’s code', async () => {
    savePlaced(contextOf(placement(), { guest: true, route: 'bank_gateway', gatewayCode: null }))
    const { wrapper } = clientProviders()
    render(<ThanksPage code="5592580094" supportPhone={null} />, { wrapper })
    const link = await screen.findByRole('link', { name: /پیگیری سفارش با کد سفارش/ })
    expect(link).toHaveAttribute('href', '/order/track/')
    await click(link)
    expect(peekOrderCode()).toBe('5592580094')
  })

  it('a payment link’s refusal (rendered on the server) hands the code its token finds here', async () => {
    keepGuestOrder()
    render(
      <PayLinkRefusal
        refusal={{ kind: 'expired', detail: 'مهلت پرداخت تمام شده است.', retryAfter: null }}
        supportPhone={null}
        linkToken="tokenForTheAwaitingOrder000000000000000001"
      />,
    )
    await click(screen.getByRole('link', { name: 'پیگیری سفارش' }))
    expect(peekOrderCode()).toBe('3067562358')
  })

  it('the card transfer’s next steps hand the order’s code', async () => {
    render(<TransferActions orderCode="1411635340" owner={false} />)
    const link = screen.getByRole('link', { name: 'پیگیری سفارش' })
    expect(link).toHaveAttribute('href', '/order/track/')
    await click(link)
    expect(peekOrderCode()).toBe('1411635340')
  })

  it('a recent order’s «پیگیری» on the page itself needs no handoff', async () => {
    keepGuestOrder()
    await renderTrack()
    const recent = screen.getByRole('list', { name: 'سفارش‌های اخیر شما' })
    await userEvent.setup().click(within(recent).getByRole('button', { name: /^پیگیری/ }))
    expect(codeField()).toHaveValue('3067562358')
    expect(peekOrderCode()).toBe('')
  })
})
