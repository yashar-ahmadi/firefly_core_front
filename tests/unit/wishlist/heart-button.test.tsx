import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeartButton } from '@/features/wishlist/heart-button'
import { WISHLIST_IDS_KEY } from '@/features/wishlist/hooks'
import { ApiError } from '@/lib/api/errors'
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

afterEach(() => {
  vi.restoreAllMocks()
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

  it('server-renders unpressed whatever the session and cache hold, and hydrates cleanly', async () => {
    mocks.bffFetch.mockResolvedValue(listOf([10001]))
    const { client, wrapper: Wrapper } = clientProviders({ hasSession: true })
    // A list already cached, as when a streamed section hydrates after the ids arrived.
    client.setQueryData(WISHLIST_IDS_KEY, [10001])
    const ui = (
      <Wrapper>
        <HeartButton productId={10001} slug="samsung-galaxy-s25-ultra" />
      </Wrapper>
    )
    const html = renderToString(ui)
    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('aria-disabled=')

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const consoleError = vi.spyOn(console, 'error')
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, ui)
    })
    expect(consoleError).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: REMOVE })).toHaveAttribute('aria-pressed', 'true')
    act(() => root?.unmount())
    container.remove()
  })

  it('waits for the saved ids: disabled while they load, so a click cannot save blindly', async () => {
    let answer: (value: unknown) => void = () => {}
    mocks.bffFetch.mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          if (path.includes('wishlist/list')) answer = resolve
        }),
    )
    const { wrapper } = clientProviders({ hasSession: true })
    render(<HeartButton productId={10001} slug="samsung-galaxy-s25-ultra" />, { wrapper })
    const button = await screen.findByRole('button', { name: ADD })
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    await userEvent.click(button)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)

    await act(async () => answer(listOf([10001])))
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
    expect(button).not.toHaveAttribute('aria-disabled')
  })

  it('after a failed read, a click saves without inventing a cached list', async () => {
    let reads = 0
    mocks.bffFetch.mockImplementation((path: string) => {
      if (!path.includes('wishlist/list')) {
        return Promise.resolve({ data: { is_in_wishlist: true }, msg: 'ذخیره شد', status: 201 })
      }
      reads += 1
      return reads === 1
        ? Promise.reject(new ApiError({ status: 429, code: 'throttled', detail: 'صبر کنید' }))
        : new Promise(() => {})
    })
    const { client, wrapper } = clientProviders({ hasSession: true })
    render(<HeartButton productId={10001} slug="samsung-galaxy-s25-ultra" />, { wrapper })
    const button = await screen.findByRole('button', { name: ADD })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))

    await userEvent.click(button)
    await waitFor(() =>
      expect(mocks.bffFetch).toHaveBeenCalledWith(
        'product/detail/samsung-galaxy-s25-ultra/wishlist/',
        {
          method: 'POST',
        },
      ),
    )
    expect(client.getQueryData(WISHLIST_IDS_KEY)).toBeUndefined()
  })
})
