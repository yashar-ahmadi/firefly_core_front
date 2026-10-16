import { render, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toCardProduct } from '@/features/catalog/card-product'
import { useRecentlyViewed } from '@/features/recently-viewed/store'
import { RecentlyViewedStrip } from '@/features/recently-viewed/strip'
import { cardFixture } from '../catalog/card-fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

stubBrowserApis()

const TITLE = 'بازدیدهای اخیر'

const saved = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    toCardProduct(
      cardFixture({
        id: index + 1,
        slug: `product-${index + 1}`,
        name: `کالای ${index + 1}`,
        type: index === 0 ? 'simple' : 'variable',
      }),
    ),
  )

function save(count: number) {
  const items = saved(count)
  localStorage.setItem('ff-recent', JSON.stringify({ state: { items }, version: 0 }))
  useRecentlyViewed.setState({ items })
}

function renderStrip() {
  const { wrapper } = clientProviders()
  return render(<RecentlyViewedStrip showOutOfStockLabel />, { wrapper })
}

beforeEach(() => {
  localStorage.clear()
  useRecentlyViewed.setState({ items: [] })
})

describe('RecentlyViewedStrip', () => {
  it('renders nothing when nothing was viewed', async () => {
    const { container } = renderStrip()
    await waitFor(() => expect(useRecentlyViewed.persist.hasHydrated()).toBe(true))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on the server, whatever this device saved', () => {
    save(2)
    const { wrapper: Wrapper } = clientProviders()
    const html = renderToString(
      <Wrapper>
        <RecentlyViewedStrip showOutOfStockLabel />
      </Wrapper>,
    )
    expect(html).toBe('')
  })

  it('shows the saved products as cards after hydration, the newest first', async () => {
    save(3)
    renderStrip()
    const region = await screen.findByRole('region', { name: TITLE })
    expect(screen.getByRole('heading', { level: 2, name: TITLE })).toBeInTheDocument()
    const cards = within(region).getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(within(cards[0]!).getByRole('link', { name: 'کالای 1' })).toHaveAttribute(
      'href',
      '/product/product-1/',
    )
    // One-tap add for the simple product only.
    expect(within(cards[0]!).getByRole('button', { name: /افزودن به سبد/ })).toBeInTheDocument()
    expect(within(cards[1]!).queryByRole('button', { name: /افزودن به سبد/ })).toBeNull()
  })
})

describe('RecentlyViewedStrip on a product page', () => {
  it('leaves out the product being viewed', async () => {
    save(3)
    const { wrapper } = clientProviders()
    render(<RecentlyViewedStrip showOutOfStockLabel excludeSlug="product-1" />, { wrapper })
    const region = await screen.findByRole('region', { name: TITLE })
    const names = within(region)
      .getAllByRole('article')
      .map((card) => within(card).getAllByRole('link')[0]!.textContent)
    expect(names).toEqual(['کالای 2', 'کالای 3'])
  })

  it('renders nothing when the product being viewed is the only one', async () => {
    save(1)
    const { wrapper } = clientProviders()
    const { container } = render(
      <RecentlyViewedStrip showOutOfStockLabel excludeSlug="product-1" />,
      { wrapper },
    )
    await waitFor(() => expect(useRecentlyViewed.persist.hasHydrated()).toBe(true))
    expect(container).toBeEmptyDOMElement()
  })
})
