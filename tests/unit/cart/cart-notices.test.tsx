import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartNotices } from '@/features/cart/components/cart-notices'
import type { Cart } from '@/lib/api/types/cart'
import { couponCartFixture, itemsCartFixture } from './fixtures'

// What the cart says once (cart digest §0.8): `adjustments` (a merge or a reorder lowered or
// dropped a line) and a coupon's `detached_reason` come in one answer only, so they stay on the
// page until dismissed; a line's `issue` stays while the API reports it. Each is read out
// politely when it appears.

const announce = vi.hoisted(() => vi.fn())
vi.mock('@/components/ui/live-announcer', () => ({ announce }))

const NOTICES = 'پیام\u{200C}های سبد خرید'
const DISMISS = 'بستن پیام'

beforeEach(() => announce.mockReset())

const adjusted = (cart: Cart = itemsCartFixture()): Cart => ({
  ...cart,
  adjustments: [
    {
      variant_id: 10119,
      product_name: 'چای سیاه ارل گری چای احمد',
      requested: 5,
      applied: 3,
      was_dropped: false,
    },
    {
      variant_id: 10123,
      product_name: 'قهوه فوری نستله گلد',
      requested: 2,
      applied: 0,
      was_dropped: true,
    },
  ],
})

describe('CartNotices', () => {
  it('renders the adjustments’ text and reads it out', () => {
    render(<CartNotices cart={adjusted()} />)
    const notices = screen.getByRole('region', { name: NOTICES })
    expect(notices).toHaveTextContent('تعداد «چای سیاه ارل گری چای احمد» از ۵ به ۳ کاهش یافت.')
    expect(notices).toHaveTextContent('«قهوه فوری نستله گلد» دیگر قابل سفارش نیست و از سبد حذف شد.')
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('از ۵ به ۳ کاهش یافت'))
  })

  it('keeps once-only notices after the next answer, until dismissed', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<CartNotices cart={adjusted()} />)
    rerender(<CartNotices cart={itemsCartFixture()} />)
    const notices = screen.getByRole('region', { name: NOTICES })
    expect(notices).toHaveTextContent('از ۵ به ۳ کاهش یافت')
    const first = within(notices).getAllByRole('button', { name: DISMISS })[0]!
    await user.click(first)
    expect(notices).not.toHaveTextContent('از ۵ به ۳ کاهش یافت')
    expect(notices).toHaveTextContent('دیگر قابل سفارش نیست')
    rerender(<CartNotices cart={itemsCartFixture({ item_count: 4 })} />)
    expect(screen.getByRole('region', { name: NOTICES })).not.toHaveTextContent('از ۵ به ۳')
  })

  it('says a coupon was taken off, and why, with the same words as a refused code', () => {
    const cart = couponCartFixture()
    render(
      <CartNotices
        cart={{
          ...cart,
          coupon: {
            ...cart.coupon,
            discount_type: null,
            detached_reason: 'coupon_min_spend_not_met',
          },
        }}
      />,
    )
    const notices = screen.getByRole('region', { name: NOTICES })
    expect(notices).toHaveTextContent('کد تخفیف «TEA30» دیگر روی سبد شما اعمال نمی\u{200C}شود.')
    expect(notices).toHaveTextContent('مبلغ سبد خرید به حداقل لازم برای این کد نمی\u{200C}رسد.')
  })

  it('shows a line’s issue while the API reports it; dismissed, it stays away for that issue', async () => {
    const user = userEvent.setup()
    const base = itemsCartFixture()
    const withIssue = (issue: Cart['lines'][number]['issue']): Cart => ({
      ...base,
      is_orderable: issue === null,
      lines: base.lines.map((line, index) =>
        index === 1 ? { ...line, issue, available_quantity: 1 } : line,
      ),
    })
    const { rerender } = render(<CartNotices cart={withIssue('insufficient_stock')} />)
    const notices = screen.getByRole('region', { name: NOTICES })
    expect(notices).toHaveTextContent('«قهوه فوری نستله گلد»: موجودی کافی نیست؛ حداکثر ۱ عدد.')
    await user.click(within(notices).getByRole('button', { name: DISMISS }))
    rerender(<CartNotices cart={withIssue('insufficient_stock')} />)
    expect(screen.queryByRole('region', { name: NOTICES })).toBeNull()
    rerender(<CartNotices cart={withIssue('unavailable')} />)
    expect(screen.getByRole('region', { name: NOTICES })).toHaveTextContent(
      '«قهوه فوری نستله گلد»: این کالا در حال حاضر موجود نیست.',
    )
  })

  it('a dismissed notice hands the focus to the next one, the last one to the page heading', async () => {
    const user = userEvent.setup()
    render(
      <>
        <h1 id="cart-heading" tabIndex={-1}>
          سبد خرید
        </h1>
        <CartNotices cart={adjusted()} />
      </>,
    )
    const [first] = screen.getAllByRole('button', { name: DISMISS })
    await user.click(first!)
    const [next] = screen.getAllByRole('button', { name: DISMISS })
    expect(next).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('region', { name: NOTICES })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('renders nothing for a cart with nothing to say', () => {
    render(<CartNotices cart={itemsCartFixture()} />)
    expect(screen.queryByRole('region', { name: NOTICES })).toBeNull()
    expect(announce).not.toHaveBeenCalled()
  })
})
