import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompareToggle } from '@/features/compare/compare-toggle'
import { useCompare, type CompareItem } from '@/features/compare/store'

const mocks = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('@/components/ui/toaster', () => ({ notify: { info: mocks.info, error: vi.fn() } }))

const item = (n: number): CompareItem => ({
  slug: `product-${n}`,
  name: `کالای ${n}`,
  image: `https://api.shop.ir/media/${n}.jpg`,
  categoryId: 10002,
})

function save(items: CompareItem[]) {
  localStorage.setItem('ff-compare', JSON.stringify({ state: { items }, version: 0 }))
}

beforeEach(() => {
  localStorage.clear()
  useCompare.setState({ items: [] })
  mocks.info.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CompareToggle', () => {
  it('server-renders the empty state and applies the saved list after hydration', async () => {
    // The visitor compared this product on an earlier page; this page load starts fresh.
    save([item(1)])
    vi.resetModules()
    const { CompareToggle: FreshToggle } = await import('@/features/compare/compare-toggle')

    const html = renderToString(<FreshToggle item={item(1)} />)
    expect(html).toContain('aria-pressed="false"')

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const consoleError = vi.spyOn(console, 'error')
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <FreshToggle item={item(1)} />)
    })
    expect(consoleError).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: 'حذف از مقایسه' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).not.toHaveClass('invisible')
    act(() => root?.unmount())
    container.remove()
  })

  it('is hidden until the saved list is read, so it never shows a wrong state', () => {
    const html = renderToString(<CompareToggle item={item(1)} />)
    expect(html).toContain('invisible')
  })

  it('toggles the product in and out of the list', async () => {
    render(<CompareToggle item={item(1)} />)
    const button = await screen.findByRole('button', { name: 'افزودن به مقایسه' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    expect(useCompare.getState().items).toEqual([item(1)])
    await userEvent.click(screen.getByRole('button', { name: 'حذف از مقایسه' }))
    expect(useCompare.getState().items).toEqual([])
  })

  it('explains when the list is full', async () => {
    for (let n = 2; n <= 5; n++) useCompare.getState().add(item(n))
    render(<CompareToggle item={item(1)} />)
    await userEvent.click(await screen.findByRole('button', { name: 'افزودن به مقایسه' }))
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('۴'))
    expect(useCompare.getState().items).toHaveLength(4)
  })
})
