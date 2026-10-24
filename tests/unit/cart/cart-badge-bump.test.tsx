import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CartBadge } from '@/features/cart/components/cart-badge'
import { CART_KEY } from '@/features/cart/hooks'
import { clientProviders } from '../support/providers'
import { cart, cartLine } from './support'

// The cart badge bumps when the count rises (spec §7.1, «the badge bumps» on add-to-cart; Plan 5
// Task 8): a small CSS animation, `motion-safe:` only, so a visitor who asked for less motion
// sees none (the e2e checks the computed animation under both settings). Not on arrival: the
// first count read after the page loads is no add.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const BUMP = 'motion-safe:animate-badge-bump'
const withCount = (count: number) => cart(count === 0 ? [] : [cartLine({ quantity: count })])

function renderBadge() {
  const { client, wrapper } = clientProviders()
  const view = render(
    <span className="relative">
      <CartBadge />
    </span>,
    { wrapper },
  )
  const badge = () => view.container.querySelector('[aria-hidden]')
  // TanStack Query tells its observers on a later task: let it, inside act.
  const set = (count: number) =>
    act(async () => {
      client.setQueryData(CART_KEY, withCount(count))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  return { badge, set }
}

beforeEach(() => {
  // The cart read never answers: only the counts the test sets are seen.
  mocks.bffFetch.mockReset().mockReturnValue(new Promise(() => {}))
})

describe('CartBadge’s bump', () => {
  it('the first count known (the page’s own read) shows without a bump', async () => {
    const { badge, set } = renderBadge()
    await set(2)
    expect(badge()).toHaveTextContent('۲')
    expect(badge()).not.toHaveClass(BUMP)
  })

  it('a rise bumps it, each rise again (a new element, so the animation replays)', async () => {
    const { badge, set } = renderBadge()
    await set(1)
    const before = badge()
    await set(2)
    expect(badge()).toHaveClass(BUMP)
    expect(badge()).not.toBe(before)
    const first = badge()
    await set(3)
    expect(badge()).toHaveClass(BUMP)
    expect(badge()).not.toBe(first)
  })

  it('the first line added to an empty cart bumps it in', async () => {
    const { badge, set } = renderBadge()
    await set(0)
    expect(badge()).toBeNull()
    await set(1)
    expect(badge()).toHaveClass(BUMP)
  })

  it('a fall does not bump it (the same element, its text changed)', async () => {
    const { badge, set } = renderBadge()
    await set(3)
    const shown = badge()
    await set(2)
    expect(badge()).toBe(shown)
    expect(badge()).not.toHaveClass(BUMP)
    expect(badge()).toHaveTextContent('۲')
  })
})
