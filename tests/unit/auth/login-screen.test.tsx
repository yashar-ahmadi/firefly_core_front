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
    notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
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
}))
vi.mock('@/features/auth/profile-api', () => ({ fetchProfile: mocks.fetchProfile }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
// `disabledAuth` lives with the server-side settings loaders.
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => false, notify: mocks.notify }))
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
  // A fresh API object per test, as on a new page: Google is initialised once per object.
  window.google = { accounts: { id: { ...gis } } }
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
  render(<LoginScreen next={next} />, { wrapper: providers.wrapper })
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
    expect(screen.queryByLabelText('ایمیل یا شمارهٔ موبایل')).toBeNull()
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
    expect(await screen.findByLabelText('ایمیل یا شمارهٔ موبایل')).toBeVisible()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('logs out from there with useLogout: busy meanwhile, then home with the toast', async () => {
    mocks.fetchProfile.mockResolvedValue(SARA)
    let answer: () => void = () => {}
    mocks.logout.mockReturnValue(new Promise<void>((resolve) => (answer = resolve)))
    const { user, client } = renderScreen({ hasSession: true })
    await screen.findByText(/سارا احمدی/)
    const logout = screen.getByRole('button', { name: 'خروج' })
    await user.click(logout)
    expect(logout).toHaveAttribute('aria-busy', 'true')
    await user.click(logout)
    answer()
    expect(await screen.findByLabelText('ایمیل یا شمارهٔ موبایل')).toBeVisible()
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(ME_KEY)).toBeUndefined()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/')
    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith('از حساب خارج شدید')
  })

  it('says sign-in is unavailable without settings, and offers no form', () => {
    renderScreen({ auth: disabledAuth() })
    expect(screen.getByText(/ورود به حساب در حال حاضر ممکن نیست/)).toBeVisible()
    expect(screen.queryByLabelText('ایمیل یا شمارهٔ موبایل')).toBeNull()
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
    expect(screen.getByLabelText('ایمیل یا شمارهٔ موبایل')).toBeVisible()

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
    expect(screen.getByLabelText('ایمیل یا شمارهٔ موبایل')).toBeVisible()
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

  it('initialises Google once; a button drawn again after a step change still signs in', async () => {
    const { user } = renderScreen({ auth: everyMethodAuth() })
    await waitFor(() => expect(gis.renderButton).toHaveBeenCalledTimes(1))
    await user.type(screen.getByLabelText('ایمیل یا شمارهٔ موبایل'), 'sara.ahmadi@example.com')
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await user.click(await screen.findByRole('button', { name: /تغییر/ }))
    await waitFor(() => expect(gis.renderButton).toHaveBeenCalledTimes(2))
    expect(gis.initialize).toHaveBeenCalledTimes(1)
    mocks.google.mockResolvedValue({ user: SARA, requires_totp: false, remember_me: false })
    await act(async () => credential?.({ credential: 'gis-id-token' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/account/'))
  })

  it('a throttled Google login waits retry_after: the button is inert, a credential ignored', async () => {
    renderScreen({ auth: everyMethodAuth() })
    await waitFor(() => expect(gis.renderButton).toHaveBeenCalledTimes(1))
    const detail = 'درخواست محدود شد. انتظار می رود در 30 ثانیه در دسترس باشد.'
    mocks.google.mockRejectedValueOnce(
      new ApiError({ status: 429, code: 'throttled', detail, retryAfter: 30 }),
    )
    await act(async () => credential?.({ credential: 'first' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('در ۳۰ ثانیه')
    expect(screen.getByText(/زمان باقی‌مانده تا تلاش دوباره/)).toBeVisible()
    expect(screen.getByText('Google').closest('[inert]')).not.toBeNull()
    await act(async () => credential?.({ credential: 'second' }))
    expect(mocks.google).toHaveBeenCalledTimes(1)
  })
})
