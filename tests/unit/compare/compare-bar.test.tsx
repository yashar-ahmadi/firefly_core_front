import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompareBar } from '@/features/compare/compare-bar'
import { useCompare, type CompareItem } from '@/features/compare/store'

const mocks = vi.hoisted(() => ({ pathname: '/', success: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))
vi.mock('@/components/ui/toaster', () => ({
  notify: { success: mocks.success, info: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const item = (n: number): CompareItem => ({
  slug: `product-${n}`,
  name: `کالای ${n}`,
  image: `https://api.shop.ir/media/${n}.jpg`,
  categoryId: 10002,
})

function save(items: CompareItem[]) {
  localStorage.setItem('ff-compare', JSON.stringify({ state: { items }, version: 0 }))
  useCompare.setState({ items })
}

const bar = () => screen.getByRole('region', { name: 'فهرست مقایسه' })

beforeEach(() => {
  localStorage.clear()
  useCompare.setState({ items: [] })
  mocks.pathname = '/product-category/digital/mobile-phone/'
  mocks.success.mockReset()
})

describe('CompareBar', () => {
  it('renders nothing on the server, whatever this device saved', () => {
    save([item(1), item(2)])
    expect(renderToString(<CompareBar />)).toBe('')
  })

  it('renders nothing with an empty list', async () => {
    const { container } = render(<CompareBar />)
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the products as thumbnails, with «مقایسه» waiting for a second one', async () => {
    save([item(1)])
    render(<CompareBar />)
    const region = await screen.findByRole('region', { name: 'فهرست مقایسه' })
    expect(within(region).getByRole('img', { name: 'کالای 1' })).toBeInTheDocument()
    const compare = within(region).getByRole('button', { name: /^مقایسه/ })
    expect(compare).toBeDisabled()
    expect(compare).toHaveAccessibleDescription('یک کالای دیگر برای مقایسه انتخاب کنید.')
  })

  it('links to the compare page from two products on', async () => {
    save([item(1), item(2)])
    render(<CompareBar />)
    const link = await within(
      await screen.findByRole('region', { name: 'فهرست مقایسه' }),
    ).findByRole('link', { name: /^مقایسه/ })
    expect(link).toHaveAttribute('href', '/compare/')
    expect(link).toHaveAccessibleName('مقایسه ۲ کالا')
  })

  it('clears the list, says so and keeps the focus on the page', async () => {
    save([item(1), item(2)])
    const main = document.createElement('main')
    main.id = 'main'
    main.tabIndex = -1
    document.body.append(main)
    render(<CompareBar />)
    await userEvent.click(
      within(await screen.findByRole('region')).getByRole('button', { name: 'پاک کردن' }),
    )
    expect(useCompare.getState().items).toEqual([])
    expect(screen.queryByRole('region', { name: 'فهرست مقایسه' })).toBeNull()
    expect(mocks.success).toHaveBeenCalledWith('فهرست مقایسه پاک شد.')
    expect(main).toHaveFocus()
    main.remove()
  })

  it('is not shown on the compare page itself, nor during checkout', async () => {
    save([item(1), item(2)])
    mocks.pathname = '/compare/'
    const { container, rerender } = render(<CompareBar />)
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
    mocks.pathname = '/checkout/'
    rerender(<CompareBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it("floats above the phone's bottom bar, clear of the safe area, and leaves room at the end", async () => {
    save([item(1), item(2)])
    const { container } = render(<CompareBar />)
    await screen.findByRole('region', { name: 'فهرست مقایسه' })
    expect(bar()).toHaveAttribute('data-compare-bar')
    expect(bar().className).toContain('var(--bottom-bar-room)')
    // A spacer in the page flow, so the bar never covers the end of the page.
    expect(container.querySelector('[data-compare-bar-spacer]')).not.toBeNull()
  })
})
