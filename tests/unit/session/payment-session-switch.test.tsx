import { act, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionSwitchSweep } from '@/lib/session/session-switch-sweep'
import { ME_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// A payment page when the tab comes back after another login elsewhere (Plan 4 final fix wave):
// the bank's return page and the card-transfer page read once whether the payment's order is
// this account's (use-order-ownership.ts) and then offer the account's order page and the
// owner's door. After an A → B switch that answer is A's, so these pages load again, as the
// account and the checkout do (their first render is a guest's or the new visitor's). The
// payment link's page holds no such answer: its visitor data is read again in place.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  const refresh = vi.fn()
  return { replace, refresh, reloadPage: vi.fn(), router: { replace, refresh, push: vi.fn() } }
})
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  reloadPage: mocks.reloadPage,
  loadPage: vi.fn(),
}))

const UUID = '3f1c2a9e-7b4d-4c1e-9a2f-5d6e7f8a9b0c'

function flagCookie(marker: string | null) {
  document.cookie = marker === null ? 'ff_auth=; max-age=0; path=/' : `ff_auth=${marker}; path=/`
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  flagCookie(null)
  window.history.replaceState(null, '', '/')
})

function renderPage(path: string) {
  window.history.replaceState(null, '', path)
  flagCookie('login-a-0123456789')
  const providers = clientProviders({ hasSession: true })
  providers.client.setQueryData(ME_KEY, { uuid: 'kamran-uuid', full_name: 'کامران یزدی' })
  providers.client.setQueryData(SUMMARY_KEY, { wishlist_count: 2 })
  render(<SessionSwitchSweep />, { wrapper: providers.wrapper })
  return providers.client
}

beforeAll(async () => {
  await import('@/lib/session/session-sweep-action')
})
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
async function backAfterAnotherLogin() {
  flagCookie('login-b-0123456789')
  act(() => void window.dispatchEvent(new Event('focus')))
  await settle()
}

describe('a payment page after another login elsewhere', () => {
  it.each([
    ['the bank’s return page', '/payment/callback/?result=success&code=1411635340'],
    ['the card-transfer page', `/payment/card-transfer/${UUID}/`],
  ])('%s: the data goes and the page loads again, once', async (_, path) => {
    const client = renderPage(path)
    await backAfterAnotherLogin()
    expect(mocks.reloadPage).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(ME_KEY)).toBeUndefined()
    expect(client.getQueryData(SUMMARY_KEY)).toBeUndefined()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('the payment link’s page: no ownership answer to drop, read again in place', async () => {
    renderPage('/order/pay/Zx8t3kLmN0pQrS4u/')
    await backAfterAnotherLogin()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })
})
