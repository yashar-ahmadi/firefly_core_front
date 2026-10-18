import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderActions } from '@/features/orders/account/order-actions'
import { orderActions } from '@/features/orders/account/order-action-rules'
import { orderKey } from '@/features/orders/account/orders-api'
import { catalog } from '../payment/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { detail, renderAccount, serve, unconfirmedCod } from './account-support'

// An order's actions on its page (order digest §6.1, §6.4): «پرداخت» while it owes online money
// (`is_payable`, the route choice through the owner's uuid door), «تأیید سفارش» for a pure
// pay-on-delivery order awaiting its confirmation (awaiting payment, nothing online, not payable,
// its link still there), «لغو سفارش» only while `can_cancel`, and always «خرید دوباره» and «کد
// QR». The route choice, the cancel dialog and the QR code load on first use.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/orders/3067562358/',
}))

beforeEach(() => {
  stubBrowserApis()
  mocks.bffFetch.mockReset()
  serve(mocks.bffFetch)
})

const button = (name: string) => screen.queryByRole('button', { name })

describe('orderActions (the rules)', () => {
  it('payable: pay and cancel; nothing to confirm', () => {
    expect(orderActions(detail('awaiting'))).toEqual({ pay: true, confirm: false, cancel: true })
  })

  it('a pure pay-on-delivery order awaiting its confirmation: confirm, never pay', () => {
    expect(orderActions(unconfirmedCod())).toEqual({ pay: false, confirm: true, cancel: true })
  })

  it('cancelled (its link revoked): nothing but the always-there actions', () => {
    const cancelled = detail('awaiting', {
      status: 'cancelled',
      is_payable: false,
      can_cancel: false,
      payment_url: null,
    })
    expect(orderActions(cancelled)).toEqual({ pay: false, confirm: false, cancel: false })
  })

  it('a status the code does not know: only what the API’s flags allow', () => {
    const odd = detail('cod', { status: 'on_hold' as never, is_payable: true })
    expect(orderActions(odd)).toEqual({ pay: true, confirm: false, cancel: false })
  })
})

describe('OrderActions', () => {
  it('«تأیید سفارش» for an order awaiting payment with nothing online and not payable', () => {
    renderAccount(<OrderActions order={unconfirmedCod()} catalog={catalog()} />)
    expect(button('تأیید سفارش')).toBeVisible()
    expect(button('پرداخت')).toBeNull()
  })

  it('«پرداخت» while it is payable, never «تأیید سفارش»', () => {
    renderAccount(<OrderActions order={detail('awaiting')} catalog={catalog()} />)
    expect(button('پرداخت')).toBeVisible()
    expect(button('تأیید سفارش')).toBeNull()
    expect(button('لغو سفارش')).toBeVisible()
  })

  it('no cancel when `can_cancel` is false; buy again and the QR code always', () => {
    renderAccount(<OrderActions order={detail('delivered')} catalog={catalog()} />)
    expect(button('لغو سفارش')).toBeNull()
    expect(button('پرداخت')).toBeNull()
    expect(button('تأیید سفارش')).toBeNull()
    expect(button('خرید دوباره')).toBeVisible()
    expect(button('کد QR')).toBeVisible()
  })

  it('«پرداخت» opens the route choice for what is owed online, through the uuid door', async () => {
    const user = userEvent.setup()
    const order = detail('awaiting')
    const { client } = renderAccount(<OrderActions order={order} catalog={catalog()} />)
    client.setQueryData(orderKey(order.order_code), order)
    await user.click(button('پرداخت')!)
    const sheet = await screen.findByRole('dialog', { name: /پرداخت سفارش/ })
    expect(
      await within(sheet).findByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' }),
    ).toBeVisible()
    expect(sheet).toHaveTextContent('۵۳٬۷۹۰٬۰۰۰ تومان')
  })

  it('«لغو سفارش» opens its question, starting on «بازگشت» (the safe choice)', async () => {
    const user = userEvent.setup()
    renderAccount(<OrderActions order={detail('awaiting')} catalog={catalog()} />)
    await user.click(button('لغو سفارش')!)
    const dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    expect(within(dialog).getByRole('button', { name: 'بازگشت' })).toHaveFocus()
  })
})
