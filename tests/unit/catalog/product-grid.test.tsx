import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { clientProviders } from '../support/providers'
import { cardFixture } from './card-fixtures'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('ProductGrid', () => {
  it('renders one list item per product in a 2/3/4/5-column grid', () => {
    const products = [
      cardFixture(),
      cardFixture({ id: 10002, slug: 'apple-iphone-16-pro-max', name: 'آیفون ۱۶ پرو مکس' }),
    ]
    const { wrapper } = clientProviders()
    render(<ProductGrid products={products} showOutOfStockLabel />, { wrapper })
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getAllByRole('article')).toHaveLength(2)
    expect(list).toHaveClass('grid-cols-2', 'md:grid-cols-3', 'lg:grid-cols-4', '2xl:grid-cols-5')
  })

  it('renders the given empty state when there are no products', () => {
    render(<ProductGrid products={[]} showOutOfStockLabel emptyState={<p>چیزی پیدا نشد</p>} />)
    expect(screen.getByText('چیزی پیدا نشد')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('falls back to a default empty state', () => {
    render(<ProductGrid products={[]} showOutOfStockLabel />)
    expect(screen.getByRole('heading', { name: 'کالایی یافت نشد' })).toBeInTheDocument()
  })
})
