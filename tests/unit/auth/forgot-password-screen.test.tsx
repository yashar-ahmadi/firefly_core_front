import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordScreen } from '@/features/auth/components/forgot-password-screen'
import { disabledAuth } from '@/features/settings/api'
import { emailOnlyAuth } from '../support/auth'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'

const mocks = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({ authApi: {} }))
vi.mock('@/features/auth/profile-api', () => ({ fetchProfile: mocks.fetchProfile }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
// `disabledAuth` lives with the server-side settings loaders.
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
})

describe('ForgotPasswordScreen', () => {
  it('shows the recovery form', () => {
    render(<ForgotPasswordScreen next="" />, {
      wrapper: authProviders({ auth: emailOnlyAuth() }).wrapper,
    })
    expect(screen.getByRole('heading', { name: 'بازیابی رمز عبور' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'بازگشت به صفحهٔ ورود' })).toHaveAttribute(
      'href',
      '/login/',
    )
  })

  it('a signed-in visitor is told so, with no redirect', () => {
    mocks.fetchProfile.mockReturnValue(new Promise(() => {}))
    render(<ForgotPasswordScreen next="" />, {
      wrapper: authProviders({ hasSession: true }).wrapper,
    })
    expect(screen.getByRole('heading', { name: 'شما وارد شده‌اید' })).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  it('without the settings (every method off) it says recovery is not possible now', () => {
    render(<ForgotPasswordScreen next="" />, {
      wrapper: authProviders({ auth: disabledAuth() }).wrapper,
    })
    expect(screen.getByText(/بازیابی رمز عبور در حال حاضر ممکن نیست/)).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
