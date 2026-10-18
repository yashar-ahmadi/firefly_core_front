import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CancelOrder } from '@/features/payment/cancel-order'
import { OpenAttemptLoader } from '@/features/payment/open-attempt-loader'
import { clientProviders } from '../support/providers'
import { LINK_TOKEN } from '../payment/fixtures'
import { expiredAttempt } from '../payment/link-fixtures'

// The payment link's lazily loaded parts when their code cannot be downloaded (a deploy since the
// page loaded, the connection): the open-attempt resume UI says so where it would be, with a
// reload and the order's payment link (a full page load); the cancel dialog says so beside its
// button. Never the root error page.

const CHUNK_FAILED = vi.hoisted(() => () => {
  throw new Error('ChunkLoadError: Loading chunk failed.')
})
vi.mock('@/features/payment/open-attempt', CHUNK_FAILED)
vi.mock('@/features/payment/cancel-order-dialog', CHUNK_FAILED)
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error')
})
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

const { wrapper } = clientProviders()

describe('the payment link’s lazy parts, when their code cannot load', () => {
  it('the resume UI: said, with a reload and the payment link', async () => {
    render(
      <OpenAttemptLoader
        attempt={expiredAttempt()}
        door={{ kind: 'link', token: LINK_TOKEN }}
        onResolved={vi.fn()}
        fallbackHref={`/order/pay/${LINK_TOKEN}/`}
      />,
      { wrapper },
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('این بخش بارگذاری نشد')
    expect(screen.getByRole('button', { name: 'بارگذاری دوباره' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'ادامه یا لغو پرداخت نیمه\u{200C}تمام' }),
    ).toHaveAttribute('href', `/order/pay/${LINK_TOKEN}/`)
  })

  it('the cancel dialog: said beside its button', async () => {
    const user = userEvent.setup()
    render(<CancelOrder token={LINK_TOKEN} onCancelled={vi.fn()} onRefused={vi.fn()} />, {
      wrapper,
    })
    await user.click(screen.getByRole('button', { name: 'لغو سفارش' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('این بخش بارگذاری نشد')
  })
})
