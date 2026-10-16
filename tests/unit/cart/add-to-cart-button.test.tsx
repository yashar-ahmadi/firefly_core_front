import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import { CART_KEY } from '@/features/cart/hooks'
import { ApiError } from '@/lib/api/errors'
import { clientProviders } from '../support/providers'
import { cart, cartLine, deferred, MSG_ADDED, result } from './support'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

const PRODUCT = {
  name: 'تلویزیون هایسنس ۵۵ اینچ U7',
  image: 'http://localhost:8000/static/defaults/default.png',
}

function renderButton(props: Partial<Parameters<typeof AddToCartButton>[0]> = {}) {
  const { client, wrapper } = clientProviders()
  render(<AddToCartButton variantId={10062} quantity={1} product={PRODUCT} {...props} />, {
    wrapper,
  })
  return client
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
})

describe('AddToCartButton', () => {
  it('is labelled «افزودن به سبد خرید» and adds the variant with its quantity', async () => {
    mocks.bffFetch.mockResolvedValue(result(cart([cartLine({ variant_id: 10062 })]), MSG_ADDED))
    const client = renderButton({ quantity: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'افزودن به سبد خرید' }))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
      method: 'POST',
      body: { variant: 10062, quantity: 2 },
    })
    await waitFor(() => expect(client.getQueryData(CART_KEY)).toBeDefined())
  })

  it('shows a spinner and aria-busy while adding, then is ready again', async () => {
    const answer = deferred<ReturnType<typeof result>>()
    mocks.bffFetch.mockReturnValue(answer.promise)
    renderButton()
    const button = screen.getByRole('button', { name: 'افزودن به سبد خرید' })
    expect(button).not.toHaveAttribute('aria-busy')

    await userEvent.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    expect(button).toBeDisabled()
    expect(button.querySelector('.animate-spin')).not.toBeNull()

    await userEvent.click(button)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)

    await act(async () => answer.resolve(result(cart([cartLine()]), MSG_ADDED)))
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'))
    expect(button).toBeEnabled()
    expect(button.querySelector('.animate-spin')).toBeNull()
  })

  it('is re-enabled after a refused add, with the reason shown', async () => {
    const detail = 'تلویزیون هایسنس در حال حاضر موجود نیست.'
    mocks.bffFetch.mockRejectedValue(
      new ApiError({
        status: 400,
        errors: [{ code: 'cart_item_out_of_stock', detail, attr: null }],
      }),
    )
    renderButton()
    const button = screen.getByRole('button', { name: 'افزودن به سبد خرید' })
    await userEvent.click(button)
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(detail))
    await waitFor(() => expect(button).toBeEnabled())
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it('is disabled and labelled «ناموجود» without a variant', async () => {
    renderButton({ variantId: null })
    const button = screen.getByRole('button', { name: 'ناموجود' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('takes a shorter label, e.g. on a narrow card', () => {
    renderButton({ label: 'افزودن به سبد' })
    expect(screen.getByRole('button', { name: 'افزودن به سبد' })).toBeEnabled()
  })

  it('can be disabled by its parent', () => {
    renderButton({ disabled: true })
    expect(screen.getByRole('button', { name: 'افزودن به سبد خرید' })).toBeDisabled()
  })
})
