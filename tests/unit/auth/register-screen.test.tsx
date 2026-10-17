import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterScreen } from '@/features/auth/components/register-screen'
import { ApiError } from '@/lib/api/errors'
import type { AuthSettings } from '@/lib/api/types/settings'
import { emailOnlyAuth } from '../support/auth'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'

// The registration page around its steps: closed (the operator's reason, a way to login, no
// form), signed in already (no redirect), and the operator's terms under the button.

const mocks = vi.hoisted(() => ({
  registerStart: vi.fn(),
  fetchProfile: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: { registerStart: mocks.registerStart },
  fetchProfile: mocks.fetchProfile,
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

const TERMS =
  '<p>با ثبت‌نام، <a href="/page/terms/" target="_blank" rel="noopener noreferrer">قوانین فروشگاه</a> را می‌پذیرید.</p>'

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
})

function renderScreen({
  auth = emailOnlyAuth(),
  next = '',
  hasSession = false,
  termsHtml = null as string | null,
  registrationOff = false,
  reason = null as string | null,
}: {
  auth?: AuthSettings
  next?: string
  hasSession?: boolean
  termsHtml?: string | null
  registrationOff?: boolean
  reason?: string | null
} = {}) {
  const user = userEvent.setup()
  const features = registrationOff
    ? { registration: { key: 'registration', name: 'ثبت نام', enabled: false, reason } as const }
    : {}
  render(<RegisterScreen next={next} initialIdentifier="" termsHtml={termsHtml} />, {
    wrapper: authProviders({ auth, hasSession, features }).wrapper,
  })
  return user
}

describe('RegisterScreen', () => {
  it.each([
    [
      'the registration feature is off',
      { registrationOff: true, reason: 'ثبت‌نام تا پایان حراج بسته است.' },
      'ثبت‌نام تا پایان حراج بسته است.',
    ],
    [
      'the feature is off without a reason',
      { registrationOff: true },
      'ثبت‌نام در حال حاضر غیرفعال است.',
    ],
    [
      'registration_methods is empty',
      { auth: { ...emailOnlyAuth(), registration_methods: [] } },
      'ثبت‌نام در حال حاضر ممکن نیست.',
    ],
  ])('shows why and links to login, with no form, when %s', (_case, options, text) => {
    renderScreen({ ...options, next: '/cart/' })
    expect(screen.getByText(text, { exact: false })).toBeVisible()
    expect(screen.getByRole('link', { name: 'ورود به حساب کاربری' })).toHaveAttribute(
      'href',
      '/login/?next=%2Fcart%2F',
    )
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'دریافت کد تأیید' })).toBeNull()
  })

  it('a signed-in visitor is told so (no redirect)', () => {
    mocks.fetchProfile.mockReturnValue(new Promise(() => {}))
    renderScreen({ hasSession: true })
    expect(screen.getByRole('heading', { name: 'شما وارد شده‌اید' })).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })

  it('503 feature_disabled on the start closes registration with the operator text', async () => {
    const user = renderScreen()
    const detail = 'ثبت‌نام موقتاً بسته است.'
    mocks.registerStart.mockRejectedValueOnce(
      new ApiError({ status: 503, code: 'feature_disabled', detail, feature: 'registration' }),
    )
    await user.type(screen.getByRole('textbox', { name: 'نام' }), 'نیما')
    await user.type(screen.getByRole('textbox', { name: 'نام خانوادگی' }), 'رضایی')
    await user.type(screen.getByRole('textbox', { name: 'ایمیل' }), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    expect(await screen.findByText(detail)).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows the operator terms under the submit button, links opening in a new tab', () => {
    renderScreen({ termsHtml: TERMS })
    const submit = screen.getByRole('button', { name: 'دریافت کد تأیید' })
    const terms = screen.getByText(/را می‌پذیرید/)
    expect(submit.compareDocumentPosition(terms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const link = screen.getByRole('link', { name: 'قوانین فروشگاه' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
