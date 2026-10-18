import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import { onlineCart, placeButton, renderCheckout, serve, signedInCart } from './place-support'

// Only the open step's body is code the page loads (Task 3's amendment; lazy-steps.tsx): a done
// step is its summary, a locked one its heading. A shopper back at the review loads the review's
// body alone; a step reopened takes the focus to its heading at once, its body coming beneath.
// The bodies' modules record when they are first imported (one module registry per test file:
// the tests run in order, each adding what it opens).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
const loaded = vi.hoisted(() => new Set<string>())
const gate = vi.hoisted(() => {
  let open = () => {}
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { opened, open: () => open() }
})

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/checkout/guest-receiver-form', async (importOriginal) => {
  loaded.add('guest-receiver-form')
  return importOriginal()
})
vi.mock('@/features/checkout/address-picker', async (importOriginal) => {
  loaded.add('address-picker')
  return importOriginal()
})
vi.mock('@/features/checkout/shipping-section', async (importOriginal) => {
  loaded.add('shipping-section')
  // Held until the test lets it come (a slow connection).
  await gate.opened
  return importOriginal()
})
vi.mock('@/features/checkout/payment-section', async (importOriginal) => {
  loaded.add('payment-section')
  return importOriginal()
})
vi.mock('@/features/checkout/review-section', async (importOriginal) => {
  loaded.add('review-section')
  return importOriginal()
})

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

const section = (name: RegExp) => screen.getByRole('region', { name })

describe('the checkout’s step bodies', () => {
  it('a shopper back at the review loads the review’s body alone', async () => {
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({ cart: onlineCart() })
    await placeButton()
    expect([...loaded]).toEqual(['review-section'])
    // The done steps are their summaries; nothing of their bodies is on the page.
    expect(section(/گیرنده و آدرس/)).toHaveAttribute('data-state', 'done')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('a guest at the receiver loads the receiver form alone', async () => {
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({ cart: onlineCart(), draft: false })
    expect(await screen.findByLabelText(/^نام گیرنده/)).toBeInTheDocument()
    expect([...loaded]).toEqual(['review-section', 'guest-receiver-form'])
    // The later steps wait: their headings only.
    expect(section(/روش ارسال/)).toHaveAttribute('data-state', 'locked')
  })

  it('a step reopened takes the focus to its heading at once; its body comes beneath', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => signedInCart())
    renderCheckout({ cart: signedInCart(), hasSession: true })
    await placeButton()
    const shipping = section(/روش ارسال/)
    await user.click(within(shipping).getByRole('button', { name: /ویرایش/ }))
    await waitFor(() => expect(shipping).toHaveAttribute('data-state', 'active'))
    expect(screen.getByRole('heading', { name: /روش ارسال/ })).toHaveFocus()
    expect(within(shipping).getByRole('status', { name: 'در حال بارگذاری' })).toBeInTheDocument()
    gate.open()
    expect(
      await within(shipping).findByRole('radiogroup', { name: 'روش\u{200C}های ارسال' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /روش ارسال/ })).toHaveFocus()
    // The receiver step stays its summary: the address picker is never loaded. (The steps
    // ahead of the open one are fetched once the shopper works in the page: payment here.)
    expect(loaded.has('shipping-section')).toBe(true)
    expect(loaded.has('address-picker')).toBe(false)
  })
})
