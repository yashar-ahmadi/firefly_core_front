import { cleanup, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CartSummary } from '@/features/cart/components/cart-summary'
import type { Cart } from '@/lib/api/types/cart'
import { formatToman } from '@/lib/format'
import { couponCartFixture, freeshipCartFixture, itemsCartFixture } from './fixtures'
import { EMPTY_SHIPPING } from './support'

// The summary of the cart page (and, as `variant="checkout"`, of the checkout): every amount is
// an API field (cart digest §5.3), nothing is added up here.

function renderSummary(cart: Cart, variant: 'cart' | 'checkout' = 'cart') {
  render(<CartSummary cart={cart} variant={variant} />)
  return screen.getByRole('region', {
    name: variant === 'cart' ? 'خلاصه\u{0654} سبد خرید' : 'خلاصه\u{0654} سفارش',
  })
}

/** The value of the row named `label` (its `<dt>`), as text. */
function value(region: HTMLElement, label: string | RegExp): string {
  const term = within(region).getByText(label, { selector: 'dt, dt *' })
  const row = term.closest('div')
  const definition = row?.querySelector('dd')
  if (!definition) throw new Error(`no value for ${String(label)}`)
  return definition.textContent ?? ''
}

const hasRow = (region: HTMLElement, label: string | RegExp) =>
  within(region).queryByText(label, { selector: 'dt, dt *' }) !== null

describe('CartSummary', () => {
  it("prints the API's total, never a sum of its rows", () => {
    // The rows of this cart do not add up to 999,999: the summary must not care.
    const region = renderSummary(itemsCartFixture({ total: 999_999 }))
    expect(value(region, 'مبلغ کل')).toBe(formatToman(999_999))
    // 2,130,000 + 213,000 (goods + tax) is what a client-side sum would print.
    expect(region).not.toHaveTextContent(formatToman(2_343_000))
  })

  it('shows the live TEA30 cart row by row, from its fields', () => {
    const region = renderSummary(couponCartFixture())
    expect(value(region, /^قیمت کالاها/)).toBe(formatToman(2_130_000))
    expect(within(region).getByText(/^قیمت کالاها/)).toHaveTextContent('(۳)')
    expect(value(region, /^کد تخفیف/)).toBe(formatToman(200_000))
    expect(within(region).getByText('TEA30')).toHaveAttribute('dir', 'ltr')
    expect(value(region, 'جمع کالاها پس از تخفیف')).toBe(formatToman(1_930_000))
    expect(value(region, 'مالیات بر ارزش افزوده')).toBe(formatToman(193_000))
    expect(value(region, 'مبلغ کل')).toBe(formatToman(2_123_000))
    expect(value(region, 'سود شما از این خرید')).toBe(formatToman(200_000))
    // No product discount in the live data, and nothing to pay at the door.
    expect(hasRow(region, 'تخفیف کالاها')).toBe(false)
    expect(hasRow(region, 'پرداخت در محل')).toBe(false)
  })

  it('has no savings, discount or after-discount rows for a cart without any', () => {
    const region = renderSummary(itemsCartFixture())
    for (const label of ['سود شما از این خرید', 'تخفیف کالاها', 'جمع کالاها پس از تخفیف']) {
      expect(hasRow(region, label), label).toBe(false)
    }
    expect(hasRow(region, /^کد تخفیف/)).toBe(false)
  })

  it('shows product discounts, shipping discount, packaging and the COD fee when the API has them', () => {
    const region = renderSummary(
      itemsCartFixture({
        item_discount: 120_000,
        shipping_discount: 113_200,
        packaging_cost: 8_000,
        cod_fee: 25_000,
      }),
    )
    expect(value(region, 'تخفیف کالاها')).toBe(formatToman(120_000))
    expect(value(region, 'تخفیف ارسال')).toBe(formatToman(113_200))
    expect(value(region, 'هزینه\u{0654} بسته\u{200C}بندی')).toBe(formatToman(8_000))
    expect(value(region, 'هزینه\u{0654} پرداخت در محل')).toBe(formatToman(25_000))
  })

  it('a coupon the API has just taken off (detached_reason) is no coupon row', () => {
    // Live: the answer that detaches FREESHIP still names it, with discount_type null.
    const cart = freeshipCartFixture()
    const detached = {
      ...cart.coupon,
      discount_type: null,
      detached_reason: 'coupon_min_spend_not_met' as const,
    }
    const region = renderSummary({ ...cart, coupon: detached })
    expect(hasRow(region, /^کد تخفیف/)).toBe(false)
    expect(hasRow(region, 'جمع کالاها پس از تخفیف')).toBe(false)
  })

  it('a free-shipping coupon says so instead of an amount', () => {
    const region = renderSummary(freeshipCartFixture())
    expect(value(region, /^کد تخفیف/)).toBe('ارسال رایگان')
    expect(within(region).getByText('FREESHIP')).toBeInTheDocument()
  })

  describe('shipping', () => {
    const shipping = (changes: Partial<Cart['shipping']>, cart: Partial<Cart> = {}) =>
      itemsCartFixture({ shipping: { ...EMPTY_SHIPPING, ...changes }, ...cart })

    it('before a method is chosen: «پس از انتخاب روش ارسال», with the cart note', () => {
      const region = renderSummary(itemsCartFixture())
      expect(value(region, 'هزینه\u{0654} ارسال')).toBe('پس از انتخاب روش ارسال')
      expect(region).toHaveTextContent('هزینه\u{0654} ارسال پس از انتخاب روش ارسال')
    })

    it('a chosen, available method: its cost, «رایگان» at 0, «پس\u{200C}کرایه» when paid at the door', () => {
      const chosen = { code: 'post-pishtaz', is_selected: true, is_available: true }
      const paid = renderSummary(shipping(chosen, { shipping_cost: 113_200 }))
      expect(value(paid, 'هزینه\u{0654} ارسال')).toBe(formatToman(113_200))
      cleanup()
      const free = renderSummary(shipping(chosen, { shipping_cost: 0 }))
      expect(value(free, 'هزینه\u{0654} ارسال')).toBe('رایگان')
      cleanup()
      const door = renderSummary(shipping({ ...chosen, freight_paid_by_recipient: true }))
      expect(value(door, 'هزینه\u{0654} ارسال')).toBe('پس\u{200C}کرایه')
    })

    it('a chosen method gone stale: its reason, and no cost', () => {
      const reason = 'این روش ارسال دیگر ارائه نمی\u{200C}شود.'
      const region = renderSummary(shipping({ is_selected: true, is_available: false, reason }))
      expect(value(region, 'هزینه\u{0654} ارسال')).toBe('پس از انتخاب روش ارسال')
      expect(region).toHaveTextContent(reason)
    })
  })

  it('the cart page splits online and at-the-door amounts when part is paid on delivery', () => {
    const region = renderSummary(
      itemsCartFixture({
        amount_charged_online: 84_599_000,
        amount_to_collect_on_delivery: 21_000,
        prepayment: 9_000,
      }),
    )
    expect(value(region, 'پرداخت آنلاین')).toBe(formatToman(84_599_000))
    expect(value(region, 'پرداخت در محل')).toBe(formatToman(21_000))
    expect(value(region, /^بیعانه/)).toBe(formatToman(9_000))
  })

  it('the checkout: «پرداخت آنلاین: A», «پرداخت هنگام تحویل: D» when D > 0, never P as a line', () => {
    const chosen = {
      ...EMPTY_SHIPPING,
      is_selected: true,
      is_available: true,
      code: 'x',
      title: 'x',
    }
    const region = renderSummary(
      itemsCartFixture({
        shipping: chosen,
        amount_charged_online: 84_599_000,
        amount_to_collect_on_delivery: 21_000,
        prepayment: 9_000,
      }),
      'checkout',
    )
    expect(value(region, 'پرداخت آنلاین')).toMatch(new RegExp(`^${formatToman(84_599_000)}`))
    expect(value(region, 'پرداخت هنگام تحویل')).toBe(formatToman(21_000))
    // The prepayment is inside A: a note on the online row, never a row to add.
    expect(hasRow(region, /^بیعانه/)).toBe(false)
    expect(region).toHaveTextContent(`شامل بیعانه\u{0654} ${formatToman(9_000)}`)
    // The checkout's own summary has no cart-page note.
    expect(region).not.toHaveTextContent('به مبلغ کل افزوده می\u{200C}شود')

    cleanup()
    // All online (D = 0): the online row alone; before shipping is chosen, A is not final yet.
    const online = renderSummary(
      itemsCartFixture({ shipping: chosen, amount_charged_online: 2_343_000 }),
      'checkout',
    )
    expect(value(online, 'پرداخت آنلاین')).toBe(formatToman(2_343_000))
    expect(hasRow(online, 'پرداخت هنگام تحویل')).toBe(false)
    cleanup()
    expect(hasRow(renderSummary(itemsCartFixture(), 'checkout'), 'پرداخت آنلاین')).toBe(false)
  })
})
