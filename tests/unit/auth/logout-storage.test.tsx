import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogout } from '@/features/auth/use-logout'
import { PLACEMENT_KEY_STORAGE, placementKey } from '@/features/checkout/idempotency'
import { PLACED_KEY } from '@/features/checkout/placed/last-placed'
import { PENDING_KEY, type PendingPayment } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import { clientProviders } from '../support/providers'

// What a logout forgets on this device besides the session (Plan 4 final fix wave): the pending
// payments saved while signed in (their uuids are bearer credentials, kept up to a week for the
// way back from a bank), this tab's last placed order (`ff-checkout-placed`: it would show that
// order to the next visitor of the tab) and the placement key. A guest's own pending payments
// stay. Every outcome that ends the session forgets them; a logout that never reached the BFF
// (the session survives) forgets nothing.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    logout: vi.fn(),
    logoutAll: vi.fn(),
    replace,
    router: { replace, push: vi.fn() },
    notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
  }
})
vi.mock('@/features/auth/api', () => ({
  authApi: { logout: mocks.logout, logoutAll: mocks.logoutAll },
}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => true, notify: mocks.notify }))

const pending = (session: boolean): PendingPayment & { session: boolean } => ({
  kind: 'order',
  orderCode: '5592580094',
  linkToken: 'ubiClbz6wHu1G-pJ9F98soBsfDqrITpZULlnO_4bi3U',
  route: 'bank_gateway',
  amount: 1_049_000,
  startedAt: Date.now(),
  session,
})

function flagCookie(present: boolean) {
  document.cookie = present ? 'ff_auth=login-a-0123456789; path=/' : 'ff_auth=; max-age=0; path=/'
}

let key = ''
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  flagCookie(true)
  localStorage.setItem(PENDING_KEY, JSON.stringify({ mine: pending(true), guest: pending(false) }))
  sessionStorage.setItem(PLACED_KEY, JSON.stringify({ orderCode: '5592580094', savedAt: 1 }))
  key = placementKey()
  // The BFF drops the session cookies whatever the API answers.
  const dropped = async () => {
    flagCookie(false)
    return {}
  }
  mocks.logout.mockImplementation(dropped)
  mocks.logoutAll.mockImplementation(dropped)
})
afterEach(() => flagCookie(false))

function logout(options = {}) {
  const { wrapper } = clientProviders({ hasSession: true })
  const { result } = renderHook(() => useLogout(), { wrapper })
  return act(() => result.current.logout(options))
}

const pendingLeft = () => Object.keys(JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}'))

describe('a logout forgets the signed-in traces on this device', () => {
  it.each([
    ['this device', {}],
    ['every device', { all: true }],
  ])(
    '%s: the session’s pending payments, the last placed order, the placement key',
    async (_, options) => {
      await logout(options)
      expect(pendingLeft()).toEqual(['guest'])
      expect(sessionStorage.getItem(PLACED_KEY)).toBeNull()
      expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBeNull()
      // The tab's in-memory copy too: the next purchase gets a new key.
      expect(placementKey()).not.toBe(key)
    },
  )

  it('the answer lost after the BFF dropped the cookies: signed out, forgotten all the same', async () => {
    mocks.logout.mockImplementationOnce(async () => {
      flagCookie(false)
      throw ApiError.network(new TypeError('network error'))
    })
    await logout()
    expect(pendingLeft()).toEqual(['guest'])
    expect(sessionStorage.getItem(PLACED_KEY)).toBeNull()
  })

  it('never reached the BFF (the session survives): nothing forgotten', async () => {
    mocks.logout.mockRejectedValueOnce(ApiError.network(new TypeError('Failed to fetch')))
    await logout()
    expect(pendingLeft()).toEqual(['mine', 'guest'])
    expect(sessionStorage.getItem(PLACED_KEY)).not.toBeNull()
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBe(key)
  })
})
