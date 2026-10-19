import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Withdrawals } from '@/features/wallet/withdrawals'
import type { QueryInit } from '@/lib/api/envelope'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import { balance, withdrawals } from './fixtures'
import { ok, refuse, renderWallet } from './wallet-support'

// «برداشت»: when a new request is offered at all (split from withdrawals.test.tsx, Plan 4 Task 10
// fix round): the open request that cannot be read is said in place with «تلاش دوباره» (no new
// request offered blind), and a balance under `minimum_withdrawal_amount` gets the minimum in a
// sentence instead of a form no amount could pass (exactly the minimum: the form).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
  useSearchParams: () => new URLSearchParams('tab=withdrawals'),
}))

type Init = { query?: QueryInit; method?: string }

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  spyOnHistory()
  // No open request; every request on record in the list.
  mocks.bffFetch.mockImplementation((path: string, init: Init = {}) => {
    if (path !== 'wallet/withdrawal/list/') return new Promise(() => {})
    if (Array.isArray(init.query?.status)) return ok({ ...withdrawals(), results: [] })
    return ok(withdrawals())
  })
})

function renderTab(wallet = balance()) {
  const view = renderWallet(<Withdrawals wallet={wallet} />)
  return { ...view, user: userEvent.setup() }
}

const list = async () => screen.findByRole('list', { name: 'درخواست‌های برداشت' })

describe('the open request cannot be read', () => {
  it('said in place with «تلاش دوباره» (no new request offered blind); the list stays', async () => {
    let fail = true
    mocks.bffFetch.mockImplementation((path: string, init: Init = {}) => {
      if (path !== 'wallet/withdrawal/list/') return new Promise(() => {})
      if (!Array.isArray(init.query?.status)) return ok(withdrawals())
      return fail ? refuse(403, 'permission_denied') : ok({ ...withdrawals(), results: [] })
    })
    const { user } = renderTab()
    expect(await screen.findByText('درخواست برداشت باز خوانده نشد.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'درخواست برداشت جدید' })).toBeNull()
    expect(await list()).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('button', { name: 'درخواست برداشت جدید' })).toBeVisible()
    expect(screen.queryByText('درخواست برداشت باز خوانده نشد.')).toBeNull()
  })
})

describe('the balance and the minimum', () => {
  it('a balance under the minimum (k.yazdi’s 0): no form that cannot be passed, the minimum said', async () => {
    renderTab(balance({ balance: 0 }))
    expect(
      await screen.findByText('برای درخواست برداشت، موجودی شما باید دست‌کم ۲۰۰٬۰۰۰ تومان باشد.'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'درخواست برداشت جدید' })).toBeNull()
    expect(await list()).toBeVisible()
  })

  it('a balance of exactly the minimum: the form is offered', async () => {
    renderTab(balance({ balance: 200_000 }))
    expect(await screen.findByRole('button', { name: 'درخواست برداشت جدید' })).toBeVisible()
  })
})
