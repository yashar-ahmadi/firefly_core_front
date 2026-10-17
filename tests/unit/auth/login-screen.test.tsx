import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginScreen } from '@/features/auth/components/login-screen'
import { disabledAuth } from '@/features/settings/api'
import { ApiError } from '@/lib/api/errors'
import type { AuthSettings } from '@/lib/api/types/settings'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { emailOnlyAuth } from '../support/auth'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { cart, result } from '../cart/support'
import { stubBrowserApis } from '../support/dom-stubs'
import { SARA } from './fixtures'

interface ScriptProps {
  src: string
  onReady?: () => void
  onError?: (event: Event) => void
}

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    google: vi.fn(),
    logout: vi.fn(),
    fetchProfile: vi.fn(),
    bffFetch: vi.fn(),
    replace,
    push: vi.fn(),
    router: { replace, push: vi.fn() },
    scripts: [] as string[],
    script: { outcome: 'ready' as 'ready' | 'error' },
  }
})
vi.mock('@/features/auth/api', () => ({
  authApi: { google: mocks.google, logout: mocks.logout },
  fetchProfile: mocks.fetchProfile,
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
// `disabledAuth` lives with the server-side settings loaders.
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))
// Google Identity Services: loads (or fails to) as the test says.
vi.mock('next/script', () => ({
  default: function Script({ src, onReady, onError }: ScriptProps) {
    useEffect(() => {
      mocks.scripts.push(src)
      if (mocks.script.outcome === 'error') onError?.(new Event('error'))
      else onReady?.()
    }, [src, onReady, onError])
    return null
  },
}))

let credential: ((response: { credential: string }) => void) | null = null
const gis = {
  initialize: vi.fn((config: { callback: (response: { credential: string }) => void }) => {
    credential = config.callback
  }),
  renderButton: vi.fn((parent: HTMLElement) => {
    parent.append(Object.assign(document.createElement('div'), { textContent: 'Google' }))
  }),
}

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  mocks.scripts.length = 0
  mocks.script.outcome = 'ready'
  credential = null
  window.google = { accounts: { id: gis } }
  mocks.bffFetch.mockResolvedValue(result(cart()))
})

afterEach(() => {
  delete window.google
})

function renderScreen({
  auth = emailOnlyAuth(),
  hasSession = false,
  next = '',
}: { auth?: AuthSettings; hasSession?: boolean; next?: string } = {}) {
  const providers = authProviders({ auth, hasSession })
  render(<LoginScreen next={next} initialIdentifier="" />, { wrapper: providers.wrapper })
  return { user: userEvent.setup(), client: providers.client }
}

describe('LoginScreen', () => {
  it('tells a signed-in visitor so, with the account and logout, and never redirects', async () => {
    mocks.fetchProfile.mockResolvedValue(SARA)
    renderScreen({ hasSession: true, next: '/cart/' })
    expect(screen.getByRole('heading', { name: 'شما وارد شده‌اید' })).toBeVisible()
    expect(await screen.findByText(/سارا احمدی/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'ادامه' })).toHaveAttribute('href', '/cart/')
    expect(screen.getByRole('link', { name: 'حساب کاربری من' })).toHaveAttribute(
      'href',
      '/account/',
    )
    expect(screen.getByRole('button', { name: 'خروج' })).toBeVisible()
    expect(screen.queryByLabelText('ایمیل یا شماره موبایل')).toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('offers no «continue» for a next that is not a path on this site', () => {
    mocks.fetchProfile.mockResolvedValue(SARA)
    renderScreen({ hasSession: true, next: '//evil.com' })
    expect(screen.queryByRole('link', { name: 'ادامه' })).toBeNull()
  })

  it('shows the form when the session turns out to be gone, without navigating', async () => {
    mocks.fetchProfile.mockRejectedValue(new ApiError({ status: 401, code: 'not_authenticated' }))
    renderScreen({ hasSession: true })
    expect(await screen.findByLabelText('ایمیل یا شماره موبایل')).toBeVisible()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('logs out from there, and the form follows', async () => {
    mocks.fetchProfile.mockResolvedValue(SARA)
    mocks.logout.mockResolvedValue({})
    const { user, client } = renderScreen({ hasSession: true })
    await screen.findByText(/سارا احمدی/)
    await user.click(screen.getByRole('button', { name: 'خروج' }))
    expect(await screen.findByLabelText('ایمیل یا شماره موبایل')).toBeVisible()
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(ME_KEY)).toBeUndefined()
  })

  it('says sign-in is unavailable without settings, and offers no form', () => {
    renderScreen({ auth: disabledAuth() })
    expect(screen.getByText(/ورود به حساب در حال حاضر ممکن نیست/)).toBeVisible()
    expect(screen.queryByLabelText('ایمیل یا شماره موبایل')).toBeNull()
    expect(mocks.scripts).toEqual([])
  })

  it('loads Google only when it is on, above an «یا», and signs in with its credential', async () => {
    renderScreen({ auth: everyMethodAuth() })
    await waitFor(() => expect(gis.renderButton).toHaveBeenCalledTimes(1))
    expect(mocks.scripts).toEqual(['https://accounts.google.com/gsi/client'])
    expect(gis.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'client-id.apps.googleusercontent.com' }),
    )
    expect(screen.getByText('یا')).toBeVisible()
    expect(screen.getByLabelText('ایمیل یا شماره موبایل')).toBeVisible()

    mocks.google.mockResolvedValue({ user: SARA, requires_totp: false, remember_me: false })
    await act(async () => credential?.({ credential: 'gis-id-token' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/account/'))
    expect(mocks.google).toHaveBeenCalledWith({ id_token: 'gis-id-token' })
  })

  it('shows neither the Google button nor its «یا» when the script fails to load', async () => {
    mocks.script.outcome = 'error'
    renderScreen({ auth: everyMethodAuth() })
    await waitFor(() => expect(mocks.scripts).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText('یا')).toBeNull())
    expect(gis.renderButton).not.toHaveBeenCalled()
    expect(screen.getByLabelText('ایمیل یا شماره موبایل')).toBeVisible()
  })

  it('treats a script without the Google API as failed too', async () => {
    delete window.google
    renderScreen({ auth: everyMethodAuth() })
    await waitFor(() => expect(mocks.scripts).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText('یا')).toBeNull())
  })

  it('loads no Google script on the dev settings', () => {
    renderScreen()
    expect(mocks.scripts).toEqual([])
    expect(screen.queryByText('یا')).toBeNull()
  })
})
