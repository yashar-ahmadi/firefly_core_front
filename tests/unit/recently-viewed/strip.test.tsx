import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRecentlyViewed, type RecentItem } from '@/features/recently-viewed/store'
import { RecentlyViewedStrip } from '@/features/recently-viewed/strip'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

stubBrowserApis()

const TITLE = 'بازدیدهای اخیر'

const saved = (count: number): RecentItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    slug: `product-${index + 1}`,
    name: `کالای ${index + 1}`,
    image: `https://api.shop.ir/media/${index + 1}.jpg`,
  }))

function save(count: number) {
  const items = saved(count)
  localStorage.setItem('ff-recent', JSON.stringify({ state: { items }, version: 0 }))
  useRecentlyViewed.setState({ items })
}

function renderStrip(excludeSlug?: string) {
  const { wrapper } = clientProviders()
  return render(<RecentlyViewedStrip excludeSlug={excludeSlug} />, { wrapper })
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
        <RecentlyViewedStrip />
      </Wrapper>,
    )
    expect(html).toBe('')
  })

  it('shows compact cards, newest first: picture, name and link, never a price or stock', async () => {
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
    expect(cards[0]!.querySelector('img')).toHaveAttribute('alt', '')
    expect(region).not.toHaveTextContent('تومان')
    expect(region).not.toHaveTextContent('ناموجود')
    expect(within(region).queryByRole('img', { name: /امتیاز/ })).toBeNull()
    expect(within(region).queryByRole('button', { name: /افزودن به سبد/ })).toBeNull()
  })

  it('clears the history on request, saying so where the strip was', async () => {
    const user = userEvent.setup()
    save(2)
    renderStrip()
    await screen.findByRole('region', { name: TITLE })
    await user.click(screen.getByRole('button', { name: 'پاک کردن بازدیدهای اخیر' }))
    expect(useRecentlyViewed.getState().items).toEqual([])
    expect(screen.queryByRole('region', { name: TITLE })).toBeNull()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('فهرست بازدیدهای اخیر پاک شد.')
    expect(status).toHaveFocus()
  })
})

describe('RecentlyViewedStrip on a product page', () => {
  it('leaves out the product being viewed', async () => {
    save(3)
    renderStrip('product-1')
    const region = await screen.findByRole('region', { name: TITLE })
    const names = within(region)
      .getAllByRole('article')
      .map((card) => within(card).getByRole('link').textContent)
    expect(names).toEqual(['کالای 2', 'کالای 3'])
  })

  it('renders nothing when the product being viewed is the only one', async () => {
    save(1)
    const { container } = renderStrip('product-1')
    await waitFor(() => expect(useRecentlyViewed.persist.hasHydrated()).toBe(true))
    expect(container).toBeEmptyDOMElement()
  })
})
