import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/hooks'
import { ProductCard } from '@/features/catalog/components/product-card'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { useCompare } from '@/features/compare/store'
import { WISHLIST_IDS_KEY } from '@/features/wishlist/hooks'
import type { ProductCard as ProductCardData } from '@/lib/api/types/catalog'
import { cart, cartLine, deferred, MSG_ADDED, result } from '../cart/support'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { cardFixture } from './card-fixtures'

// The product card's buttons are one client island per card (CardActions) reading its grid's
// CardScope: one wishlist query and one compare subscription per grid, and no mutation until a
// button is pressed.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

stubBrowserApis()

const SAVE = 'افزودن به علاقه\u{200C}مندی\u{200C}ها'
const UNSAVE = 'حذف از علاقه\u{200C}مندی\u{200C}ها'

const simple = (id: number, changes: Partial<ProductCardData> = {}) =>
  cardFixture({
    id,
    slug: `simple-${id}`,
    name: `کالای ${id}`,
    type: 'simple',
    default_variant_id: id * 10,
    ...changes,
  })

const GRID = Array.from({ length: 6 }, (_, index) => simple(index + 1))

function idsAnswer(ids: number[]) {
  const results = ids.map((id) => ({ id }))
  return {
    data: { count: ids.length, total_pages: 1, current_page: 1, next: null, results },
    msg: '',
    status: 200,
  }
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  localStorage.clear()
  useCompare.setState({ items: [] })
})

describe('CardActions in a grid', () => {
  it('reads the wishlist once for the whole grid and creates no mutation before a press', async () => {
    mocks.bffFetch.mockResolvedValue(idsAnswer([2]))
    const { client, wrapper } = clientProviders({ hasSession: true })
    render(<ProductGrid products={GRID} showOutOfStockLabel withAction />, { wrapper })
    const query = client.getQueryCache().find({ queryKey: WISHLIST_IDS_KEY })
    expect(query?.getObserversCount()).toBe(1)
    expect(client.getMutationCache().getAll()).toHaveLength(0)
    const [, second] = screen.getAllByRole('article')
    await waitFor(() =>
      expect(within(second!).getByRole('button', { name: UNSAVE })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
  })

  it('toggles a heart with a mutation created by the press, described by the name', async () => {
    // The server's list: what the POST saved is there when the ids are read again.
    const saved: number[] = []
    mocks.bffFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('product/wishlist/list/')) return idsAnswer([...saved])
      saved.push(1)
      return { data: { is_in_wishlist: true }, msg: '' }
    })
    const { client, wrapper } = clientProviders({ hasSession: true })
    render(<ProductGrid products={GRID} showOutOfStockLabel withAction />, { wrapper })
    const [first] = screen.getAllByRole('article')
    const heart = within(first!).getByRole('button', { name: SAVE })
    expect(heart).toHaveAccessibleDescription('کالای 1')
    await waitFor(() => expect(heart).not.toHaveAttribute('aria-disabled'))
    await userEvent.click(heart)
    expect(await within(first!).findByRole('button', { name: UNSAVE })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(mocks.bffFetch).toHaveBeenCalledWith('product/detail/simple-1/wishlist/', {
      method: 'POST',
    })
    expect(client.getMutationCache().getAll()).toHaveLength(1)
  })

  it('sends a guest to the login page from a heart', async () => {
    const { wrapper } = clientProviders()
    render(<ProductGrid products={GRID} showOutOfStockLabel withAction />, { wrapper })
    await userEvent.click(
      within(screen.getAllByRole('article')[0]!).getByRole('button', { name: SAVE }),
    )
    // From the home page: no `next` (loginHref).
    expect(mocks.push).toHaveBeenCalledWith('/login/')
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('adds in one tap with a busy button, ignoring a second press meanwhile', async () => {
    const answer = deferred<ReturnType<typeof result>>()
    mocks.bffFetch.mockReturnValue(answer.promise)
    const { client, wrapper } = clientProviders()
    render(<ProductGrid products={GRID} showOutOfStockLabel withAction />, { wrapper })
    const card = screen.getAllByRole('article')[2]!
    const add = within(card).getByRole('button', { name: 'افزودن به سبد' })
    expect(add).toHaveAccessibleDescription('کالای 3')
    await userEvent.click(add)
    await waitFor(() => expect(add).toHaveAttribute('aria-busy', 'true'))
    await userEvent.click(add)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
      method: 'POST',
      body: { variant: 30, quantity: 1 },
    })
    await act(async () => answer.resolve(result(cart([cartLine({ variant_id: 30 })]), MSG_ADDED)))
    await waitFor(() => expect(add).not.toHaveAttribute('aria-busy'))
    expect(client.getQueryData(CART_KEY)).toBeDefined()
  })

  it('starts at the minimum order and says «ناموجود» out of stock', async () => {
    mocks.bffFetch.mockResolvedValue(result(cart([cartLine()]), MSG_ADDED))
    const products = [simple(1, { order_limit_min: 3 }), simple(2, { in_stock: false })]
    const { wrapper } = clientProviders()
    render(<ProductGrid products={products} showOutOfStockLabel withAction />, { wrapper })
    const [first, second] = screen.getAllByRole('article')
    await userEvent.click(within(first!).getByRole('button', { name: 'افزودن به سبد' }))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
      method: 'POST',
      body: { variant: 10, quantity: 3 },
    })
    expect(within(second!).getByRole('button', { name: 'ناموجود' })).toBeDisabled()
  })

  it('compares through the grid’s one subscription', async () => {
    const { wrapper } = clientProviders()
    render(<ProductGrid products={GRID} showOutOfStockLabel withAction />, { wrapper })
    const card = screen.getAllByRole('article')[1]!
    await userEvent.click(within(card).getByRole('button', { name: 'افزودن به مقایسه' }))
    expect(useCompare.getState().items.map((item) => item.slug)).toEqual(['simple-2'])
    expect(within(card).getByRole('button', { name: 'حذف از مقایسه' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('hydrates the server HTML without a mismatch', async () => {
    const { wrapper: Wrapper } = clientProviders({ hasSession: true })
    const ui = (
      <Wrapper>
        <ProductGrid products={GRID} showOutOfStockLabel withAction />
      </Wrapper>
    )
    const container = document.createElement('div')
    container.innerHTML = renderToString(ui)
    document.body.append(container)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => {
        root = hydrateRoot(container, ui, { onRecoverableError: (error) => console.error(error) })
      })
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
      act(() => root?.unmount())
      container.remove()
    }
  })
})

describe('CardActions outside a grid', () => {
  it('brings its own scope', async () => {
    const { wrapper } = clientProviders()
    render(<ProductCard product={simple(9)} showOutOfStockLabel withAction />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'افزودن به مقایسه' }))
    expect(screen.getByRole('button', { name: 'حذف از مقایسه' })).toBeInTheDocument()
  })
})
