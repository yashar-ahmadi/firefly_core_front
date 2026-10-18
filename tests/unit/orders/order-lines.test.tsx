import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderLines } from '@/features/orders/components/order-lines'
import type { OrderDetail, OrderLine } from '@/lib/api/types/order-detail'
import delivered from '../../fixtures/order-detail-delivered.json'
import store from '../../fixtures/order-detail-store.json'

// The order's lines (order digest §6.4, live OrderDetail fixtures): name (linked to the product
// unless its variant was deleted), variant, brand, quantity in its unit, the unit's final price
// (the price before it struck through when discounted) and the line's total, all API fields,
// never a sum made here. A slot per line for the account's actions (a review, Task 8).

const lines = (fixture: { data: unknown }) => structuredClone((fixture.data as OrderDetail).lines)
const items = () =>
  within(screen.getByRole('list', { name: 'اقلام سفارش' })).getAllByRole('listitem')

describe('OrderLines', () => {
  it('each line: its name linked to the product, the variant, brand and quantity in its unit', () => {
    render(<OrderLines lines={lines(delivered)} />)
    const shown = items()
    expect(shown).toHaveLength(3)
    const band = shown[1]!
    expect(
      within(band).getByRole('link', { name: 'مچ بند هوشمند شیائومی Smart Band 9' }),
    ).toHaveAttribute('href', '/product/xiaomi-smart-band-9/')
    expect(band).toHaveTextContent('رنگ: مشکی')
    expect(band).toHaveTextContent('شیائومی')
    expect(shown[2]).toHaveTextContent('۲ عدد')
  })

  it('a discounted line: the unit price struck, the final one, the API’s line total', () => {
    render(<OrderLines lines={lines(store)} />)
    const cable = items()[0]!
    expect(within(cable).getByText('۴۲۰٬۰۰۰ تومان').closest('del')).not.toBeNull()
    expect(cable).toHaveTextContent('۳۵۰٬۰۰۰ تومان')
    expect(cable).toHaveTextContent('۱٬۰۵۰٬۰۰۰ تومان')
    // Not discounted: nothing struck.
    expect(items()[1]!.querySelector('del')).toBeNull()
  })

  it('shows the API’s totals, never quantity × price', () => {
    const [first, ...rest] = lines(store)
    const odd: OrderLine = { ...first!, line_total: 999_000 }
    render(<OrderLines lines={[odd, ...rest]} />)
    expect(items()[0]).toHaveTextContent('۹۹۹٬۰۰۰ تومان')
    expect(items()[0]).not.toHaveTextContent('۱٬۰۵۰٬۰۰۰ تومان')
  })

  it('a deleted variant (no slug): its name without a link; no picture: a placeholder', () => {
    const [first] = lines(delivered)
    render(<OrderLines lines={[{ ...first!, product_slug: null, image: null }]} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('هدفون انکر Soundcore Life Q30')).toBeVisible()
    expect(items()[0]!.querySelector('[data-line-placeholder]')).not.toBeNull()
  })

  it('a slot per line for the page’s action', () => {
    render(
      <OrderLines
        lines={lines(delivered)}
        action={(line) => <button type="button">{`نظر دربارهٔ ${line.product_name}`}</button>}
      />,
    )
    expect(screen.getAllByRole('button', { name: /^نظر دربارهٔ/ })).toHaveLength(3)
  })
})
