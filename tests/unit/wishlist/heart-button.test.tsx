import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeartButton } from '@/features/wishlist/heart-button'
import { clientProviders } from '../support/providers'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

const ADD = 'افزودن به علاقه\u{200C}مندی\u{200C}ها'
const REMOVE = 'حذف از علاقه\u{200C}مندی\u{200C}ها'

function listOf(ids: number[]) {
  return {
    data: {
      count: ids.length,
      total_pages: 1,
      current_page: 1,
      page_size: 100,
      next: null,
      previous: null,
      results: ids.map((id) => ({ id, slug: `product-${id}` })),
    },
    msg: '',
    status: 200,
  }
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
})

describe('HeartButton', () => {
  it('is pressed for a saved product and labelled for removal', async () => {
    mocks.bffFetch.mockResolvedValue(listOf([10001]))
    const { wrapper } = clientProviders({ hasSession: true })
    render(<HeartButton productId={10001} slug="samsung-galaxy-s25-ultra" />, { wrapper })
    const button = await screen.findByRole('button', { name: REMOVE })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles on click and animates only after the click', async () => {
    // A tiny server: POST saves, and later reads include the saved product.
    const saved: number[] = []
    mocks.bffFetch.mockImplementation((path: string, opts: { method?: string } = {}) => {
      if (path.includes('wishlist/list')) return Promise.resolve(listOf(saved))
      if (opts.method === 'POST') saved.push(10001)
      return Promise.resolve({ data: { is_in_wishlist: true }, msg: '', status: 201 })
    })
    const { wrapper } = clientProviders({ hasSession: true })
    render(<HeartButton productId={10001} slug="samsung-galaxy-s25-ultra" />, { wrapper })
    const button = await screen.findByRole('button', { name: ADD })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button.querySelector('.motion-safe\\:animate-heart')).toBeNull()

    await userEvent.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
    expect(button).toHaveAccessibleName(REMOVE)
    expect(button.querySelector('.motion-safe\\:animate-heart')).not.toBeNull()
  })

  it('sends a guest to login instead of saving', async () => {
    const { wrapper } = clientProviders({ hasSession: false })
    render(<HeartButton productId={10001} slug="samsung-galaxy-s25-ultra" />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: ADD }))
    expect(mocks.push).toHaveBeenCalledWith('/login/')
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })
})
