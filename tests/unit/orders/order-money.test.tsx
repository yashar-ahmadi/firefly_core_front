import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderMoney } from '@/features/orders/account/order-money'
import type { OrderMoney as Money } from '@/lib/api/types/order-detail'
import { detail } from './account-support'

// An order's money (order digest §5.0, §6.4): the API's own fields in the digest's order, every
// figure as it came, never computed (the page adds nothing up): a fixture whose rows do not add up
// shows each row's own field. Discounts as minus, a free shipping as «رایگان», the shipping saving
// only when there is one, the tax with its rate, the split (online A with its prepayment, at the
// door D), what was settled each way and what is still owed online (O).

const money = (changes: Partial<Money>): Money => ({ ...detail('delivered').money, ...changes })
/** The row whose term reads `name` (a term may hold more than text: the coupon's chip). */
const row = (name: RegExp) => {
  const terms = screen.getAllByRole('term').filter((term) => name.test(term.textContent ?? ''))
  expect(terms, String(name)).toHaveLength(1)
  return terms[0]!.parentElement as HTMLElement
}

describe('OrderMoney', () => {
  it('shows every row from its own field, even when they do not add up', () => {
    const odd = money({
      goods_subtotal: 1_000,
      item_discount: 100,
      goods_total: 777,
      coupon_discount: 50,
      goods_payable: 555,
      shipping_cost: 20,
      packaging_cost: 5,
      tax_rate: '10.00',
      tax_amount: 33,
      cod_fee: 7,
      total: 999_999,
      total_savings: 12,
    })
    const order = detail('delivered', {
      money: odd,
      coupon: {
        code: 'TEA30',
        title: 'چای',
        discount_type: 'percentage',
        max_discount_amount: null,
      },
    })
    render(<OrderMoney order={order} />)
    expect(row(/^جمع کالاها/)).toHaveTextContent('۱٬۰۰۰ تومان')
    expect(row(/^تخفیف کالاها/)).toHaveTextContent('۱۰۰ تومان')
    expect(row(/^پس از تخفیف کالاها/)).toHaveTextContent('۷۷۷ تومان')
    expect(row(/^کد تخفیف/)).toHaveTextContent('TEA30')
    expect(row(/^کد تخفیف/)).toHaveTextContent('۵۰ تومان')
    expect(row(/^مبلغ کالاها پس از کد تخفیف/)).toHaveTextContent('۵۵۵ تومان')
    expect(row(/^هزینهٔ ارسال/)).toHaveTextContent('۲۰ تومان')
    expect(row(/^هزینهٔ بسته‌بندی/)).toHaveTextContent('۵ تومان')
    expect(row(/^مالیات/)).toHaveTextContent('۱۰٪')
    expect(row(/^مالیات/)).toHaveTextContent('۳۳ تومان')
    expect(row(/^هزینهٔ پرداخت در محل/)).toHaveTextContent('۷ تومان')
    // Savings are said in the sale colour, as in the cart, never with a minus sign.
    expect(document.body).not.toHaveTextContent('−')
    expect(row(/^مبلغ کل/)).toHaveTextContent('۹۹۹٬۹۹۹ تومان')
    expect(row(/^سود شما از این خرید/)).toHaveTextContent('۱۲ تومان')
  })

  it('in the digest’s order (§6.4): packaging, tax, the pay-on-delivery fee, then the total', () => {
    const order = detail('delivered', {
      money: money({ packaging_cost: 5, tax_rate: '10.00', tax_amount: 33, cod_fee: 7 }),
    })
    render(<OrderMoney order={order} />)
    const terms = screen
      .getAllByRole('term')
      .map((term) => term.textContent ?? '')
      .filter((text) => /^(هزینهٔ بسته‌بندی|مالیات|هزینهٔ پرداخت در محل|مبلغ کل)/.test(text))
      .map((text) => text.split(' ')[0] + ' ' + text.split(' ')[1])
    expect(terms).toEqual(['هزینهٔ بسته‌بندی', 'مالیات بر', 'هزینهٔ پرداخت', 'مبلغ کل'])
  })

  it('a free shipping says «رایگان»; no saving, discount, packaging or fee rows when zero', () => {
    render(
      <OrderMoney
        order={detail('delivered', {
          money: money({
            shipping_cost: 0,
            item_discount: 0,
            packaging_cost: 0,
            cod_fee: 0,
            coupon_discount: 0,
            shipping_discount: 0,
            total_savings: 0,
          }),
        })}
      />,
    )
    expect(row(/^هزینهٔ ارسال/)).toHaveTextContent('رایگان')
    for (const name of [
      /^تخفیف کالاها/,
      /^هزینهٔ بسته‌بندی/,
      /^هزینهٔ پرداخت در محل/,
      /^کد تخفیف/,
      /^تخفیف ارسال/,
      /^سود شما/,
    ])
      expect(screen.queryByText(name, { selector: 'dt' })).toBeNull()
  })

  it('a fare the carrier collects at the door: «پس‌کرایه», never «رایگان»', () => {
    render(
      <OrderMoney
        order={detail('delivered', {
          freight_paid_by_recipient: true,
          money: money({ shipping_cost: 0 }),
        })}
      />,
    )
    expect(row(/^هزینهٔ ارسال/)).toHaveTextContent('پس‌کرایه')
    expect(row(/^هزینهٔ ارسال/)).not.toHaveTextContent('رایگان')
  })

  it('the split: online (with its prepayment), at the door, settled each way, still owed', () => {
    const order = detail('cod', {
      money: money({
        amount_charged_online: 70_000,
        prepayment: 20_000,
        amount_to_collect_on_delivery: 289_000,
        amount_settled_online: 70_000,
        amount_settled_on_delivery: 0,
        amount_outstanding_online: 5_000,
      }),
    })
    render(<OrderMoney order={order} />)
    const split = screen.getByRole('region', { name: 'پرداخت' })
    expect(
      within(split).getByText(/^پرداخت آنلاین/, { selector: 'dt' }).parentElement,
    ).toHaveTextContent('۷۰٬۰۰۰ تومان')
    expect(split).toHaveTextContent('شامل بیعانهٔ ۲۰٬۰۰۰ تومان')
    expect(
      within(split).getByText(/^پرداخت هنگام تحویل/, { selector: 'dt' }).parentElement,
    ).toHaveTextContent('۲۸۹٬۰۰۰ تومان')
    expect(
      within(split).getByText(/^پرداخت‌شده آنلاین/, { selector: 'dt' }).parentElement,
    ).toHaveTextContent('۷۰٬۰۰۰ تومان')
    expect(
      within(split).getByText(/^دریافت‌شده هنگام تحویل/, { selector: 'dt' }).parentElement,
    ).toHaveTextContent('۰ تومان')
    expect(
      within(split).getByText(/^مانده برای پرداخت آنلاین/, { selector: 'dt' }).parentElement,
    ).toHaveTextContent('۵٬۰۰۰ تومان')
  })

  it('paid on delivery alone: no «پرداخت آنلاین ۰»; a free order still says its online share', () => {
    const cod = detail('cod')
    expect(cod.money.amount_charged_online).toBe(0)
    const { unmount } = render(<OrderMoney order={cod} />)
    const split = screen.getByRole('region', { name: 'پرداخت' })
    expect(within(split).queryByText(/^پرداخت آنلاین/, { selector: 'dt' })).toBeNull()
    expect(within(split).getByText(/^پرداخت هنگام تحویل/, { selector: 'dt' })).toBeVisible()
    unmount()
    render(
      <OrderMoney
        order={detail('cod', {
          money: money({ amount_charged_online: 0, amount_to_collect_on_delivery: 0 }),
        })}
      />,
    )
    expect(row(/^پرداخت آنلاین/)).toHaveTextContent('۰ تومان')
  })

  it('a cancelled order does not say anything is still owed (O is not zeroed on cancel)', () => {
    const order = detail('awaiting', { status: 'cancelled', is_payable: false, can_cancel: false })
    render(<OrderMoney order={order} />)
    expect(screen.queryByText(/^مانده برای پرداخت آنلاین/, { selector: 'dt' })).toBeNull()
  })
})
