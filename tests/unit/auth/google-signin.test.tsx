import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginFlow } from '@/features/auth/components/login-flow'
import { ApiError } from '@/lib/api/errors'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { handedByClick, resetHandoff } from '../support/handoff'

// «ورود با گوگل» on the login page's first step (auth digest F4): Google draws its button in a
// frame of its own inside the slot. A 429 makes the slot inert while the wait runs, which would
// drop the focus a visitor had in Google's frame: it moves to the wait note instead. An account
// Google knows but the shop does not (`auth_user_not_found`) is offered a plain registration
// link: the identifier field is not what Google signed in with, so nothing is handed over.

interface ScriptProps {
  src: string
  onReady?: () => void
}

const mocks = vi.hoisted(() => ({ google: vi.fn(), replace: vi.fn(), push: vi.fn() }))
vi.mock('@/features/auth/api', () => ({ authApi: { google: mocks.google } }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('next/script', () => ({
  default: function Script({ onReady }: ScriptProps) {
    useEffect(() => onReady?.(), [onReady])
    return null
  },
}))

let credential: ((response: { credential: string }) => void) | null = null
/** Google's button: a focusable control inside the slot (in a browser, its frame). */
const gis = {
  initialize: vi.fn((config: { callback: (response: { credential: string }) => void }) => {
    credential = config.callback
  }),
  renderButton: vi.fn((parent: HTMLElement) => {
    parent.append(Object.assign(document.createElement('button'), { textContent: 'Google' }))
  }),
}

const REGISTRATION_OFF = {
  registration: { key: 'registration', name: 'ثبت نام', enabled: false, reason: null },
} as const

function renderLogin(features = {}) {
  const user = userEvent.setup()
  render(<LoginFlow next="" />, {
    wrapper: authProviders({ auth: everyMethodAuth(), features }).wrapper,
  })
  return user
}

async function googleAnswers(error: ApiError) {
  await waitFor(() => expect(gis.renderButton).toHaveBeenCalled())
  mocks.google.mockRejectedValueOnce(error)
  await act(async () => credential?.({ credential: 'gis-id-token' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  resetHandoff()
  credential = null
  window.google = { accounts: { id: { ...gis } } }
})

afterEach(() => {
  delete window.google
})

describe('Google sign-in', () => {
  it('a 429 while the focus is in Google’s button: the slot goes inert, the focus to the wait note', async () => {
    renderLogin()
    await waitFor(() => expect(gis.renderButton).toHaveBeenCalled())
    screen.getByRole('button', { name: 'Google' }).focus()
    await googleAnswers(
      new ApiError({ status: 429, code: 'throttled', detail: 'محدود شد.', retryAfter: 30 }),
    )
    const note = await screen.findByText(/زمان باقی‌مانده تا تلاش دوباره/)
    expect(screen.getByText('Google').closest('[inert]')).not.toBeNull()
    await waitFor(() => expect(note.closest('[tabindex="-1"]')).toHaveFocus())
  })

  it('a 429 with the focus elsewhere leaves it there', async () => {
    const user = renderLogin()
    const field = screen.getByLabelText('ایمیل یا شمارهٔ موبایل')
    await user.click(field)
    await googleAnswers(
      new ApiError({ status: 429, code: 'throttled', detail: 'محدود شد.', retryAfter: 30 }),
    )
    await screen.findByText(/زمان باقی‌مانده تا تلاش دوباره/)
    expect(field).toHaveFocus()
  })

  it('an account the shop does not have: a plain «ثبت‌نام» link while registration is open', async () => {
    const user = renderLogin()
    // Typed before choosing Google: not the address Google signed in with.
    await user.type(screen.getByLabelText('ایمیل یا شمارهٔ موبایل'), 'other@example.com')
    await googleAnswers(
      new ApiError({ status: 404, code: 'auth_user_not_found', detail: 'کاربری یافت نشد.' }),
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('کاربری یافت نشد.')
    const register = within(alert).getByRole('link', { name: 'ثبت‌نام' })
    expect(register).toHaveAttribute('href', '/register/')
    expect(await handedByClick(register, '/register/')).toBe('')
  })

  it('no registration link while registration is closed', async () => {
    renderLogin(REGISTRATION_OFF)
    await googleAnswers(
      new ApiError({ status: 404, code: 'auth_user_not_found', detail: 'کاربری یافت نشد.' }),
    )
    const alert = await screen.findByRole('alert')
    expect(within(alert).queryByRole('link')).toBeNull()
  })
})
