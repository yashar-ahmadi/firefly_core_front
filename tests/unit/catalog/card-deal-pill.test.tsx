import { render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ProductCard } from '@/features/catalog/components/product-card'
import type { ProductCard as ProductCardData } from '@/lib/api/types/catalog'
import { clientProviders } from '../support/providers'
import { discountedCard } from './card-fixtures'

// The timed-deal pill on a product card's image.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function renderCard(product: ProductCardData, props: { showOutOfStockLabel?: boolean } = {}) {
  const { wrapper } = clientProviders()
  return render(
    <ProductCard product={product} showOutOfStockLabel={props.showOutOfStockLabel ?? true} />,
    { wrapper },
  )
}

function card(): HTMLElement {
  return screen.getByRole('article')
}

describe('ProductCard deal pill', () => {
  it('shows no deal countdown on an out-of-stock product, whatever the stock label setting', () => {
    const soldOut = discountedCard({
      in_stock: false,
      discount_time_remaining: Date.now() + 3_600_000,
    })
    for (const showOutOfStockLabel of [true, false]) {
      const { unmount } = renderCard(soldOut, { showOutOfStockLabel })
      expect(within(card()).queryByRole('timer')).toBeNull()
      expect(within(card()).getByText('پرفروش')).toBeInTheDocument()
      unmount()
    }
  })

  it('keeps the countdown text one width before and after hydration, as days or as a clock', () => {
    // «--:--:--» before the clock runs (server and hydration), then «۲ روز» or «۰۱:۰۲:۰۳»: one
    // fixed slot (the clock's width), so the badge beside it never re-wraps.
    const SLOT = 'w-[4.75em]'
    const days = discountedCard({ discount_time_remaining: Date.now() + (2 * 24 + 5) * 3_600_000 })
    const { wrapper: Wrapper } = clientProviders()
    const html = renderToString(
      <Wrapper>
        <ProductCard product={days} showOutOfStockLabel />
      </Wrapper>,
    )
    const server = document.createElement('div')
    server.innerHTML = html
    expect(server.querySelector('[role="timer"]')?.textContent).toBe('--:--:--')
    expect(server.querySelector('[role="timer"]')?.className).toContain(SLOT)

    const { unmount } = renderCard(days)
    expect(within(card()).getByRole('timer').textContent).toBe('۲ روز')
    expect(within(card()).getByRole('timer').className).toContain(SLOT)
    unmount()
    renderCard(discountedCard({ discount_time_remaining: Date.now() + 3_723_000 }))
    expect(within(card()).getByRole('timer').className).toContain(SLOT)
  })
})
