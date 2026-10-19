import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginFlow } from '@/features/auth/components/login-flow'
import { ApiError } from '@/lib/api/errors'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { resetHandoff } from '../support/handoff'

// «ورود با گوگل» on the login page's first step (auth digest F4): Google draws its button in a
// frame of its own inside the slot. A 429 makes the slot inert while the wait runs, which would
// drop the focus a visitor had in Google's frame: it moves to the wait note instead.

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
    const field = screen.getByLabelText('ایمیل یا شماره موبایل')
    await user.click(field)
    await googleAnswers(
      new ApiError({ status: 429, code: 'throttled', detail: 'محدود شد.', retryAfter: 30 }),
    )
    await screen.findByText(/زمان باقی‌مانده تا تلاش دوباره/)
    expect(field).toHaveFocus()
  })
})
