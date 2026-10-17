import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentPurchases } from '@/features/account/dashboard/recent-purchases'
import { SummaryCards } from '@/features/account/dashboard/summary-cards'
import { ApiError } from '@/lib/api/errors'
import { authProviders } from '../support/auth-providers'

// A section of an account page that could not be read shows the same error as a list (one
// component): a 429 says calmly to wait and holds «تلاش دوباره» for its `retry_after`, as the
// lists do, instead of offering a retry the API will refuse again.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/account/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const throttled = () =>
  ApiError.fromBody(429, {
    msg: 'خطا',
    data: {
      type: 'client_error',
      errors: [{ code: 'throttled', detail: 'تعداد درخواست‌ها زیاد است.', attr: null }],
      retry_after: 20,
    },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bffFetch.mockImplementation(() => Promise.reject(throttled()))
})

describe.each([
  ['the summary', <SummaryCards key="summary" />],
  ['the recent purchases', <RecentPurchases key="purchases" />],
])('%s answers 429', (_, section) => {
  it('a calm sentence, and «تلاش دوباره» waits out retry_after', async () => {
    const user = userEvent.setup()
    render(section, { wrapper: authProviders({ hasSession: true }).wrapper })
    expect(await screen.findByText('لطفاً کمی بعد دوباره تلاش کنید.')).toBeVisible()
    const retry = screen.getByRole('button', { name: 'تلاش دوباره' })
    expect(retry).toHaveAttribute('aria-disabled', 'true')
    expect(retry).toHaveAccessibleDescription('زمان باقی‌مانده تا تلاش دوباره: ۰۰:۲۰')
    const reads = mocks.bffFetch.mock.calls.length
    await user.click(retry)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(reads)
  })
})
