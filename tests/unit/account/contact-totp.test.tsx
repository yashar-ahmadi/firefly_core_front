import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactSection } from '@/features/account/profile/contact-section'
import { emailOnlyAuth } from '../support/auth'
import { stubBrowserApis } from '../support/dom-stubs'
import { apiError, renderWithMe, saraWith } from './profile-support'

// A contact change with two-step login on (auth digest §4.17, §2.3): the request carries the
// authenticator's code, which works once. Whatever the answer (a code sent, a send refused, the
// code itself refused), the code is spent: the boxes empty and the next request needs the next
// one. The password stays typed.

const mocks = vi.hoisted(() => ({
  contactRequest: vi.fn(),
  contactVerify: vi.fn(),
  totpStatus: vi.fn(),
  bffFetch: vi.fn(),
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    contactRequest: mocks.contactRequest,
    contactVerify: mocks.contactVerify,
    totpStatus: mocks.totpStatus,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const
const TOTP = 'کد برنامهٔ احراز هویت'

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.totpStatus.mockResolvedValue({ is_totp_enabled: true })
  mocks.contactRequest.mockResolvedValue(SENT)
})

afterEach(() => vi.useRealTimers())

const totpBoxes = () => within(screen.getByRole('group', { name: TOTP })).getAllByRole('textbox')

/** sara (two-step login on) fills the email change, the authenticator's code included. */
async function fillRequest() {
  const view = renderWithMe((me) => <ContactSection me={me} />, {
    me: saraWith({ is_totp_enabled: true }),
    auth: emailOnlyAuth(),
  })
  const { user } = view
  await user.click(screen.getByRole('button', { name: 'تغییر ایمیل' }))
  await user.type(await screen.findByRole('textbox', { name: 'ایمیل تازه' }), 'n@example.com')
  await user.type(screen.getByLabelText('رمز فعلی', { selector: 'input' }), 'Firefly@1234')
  await user.type(totpBoxes()[0]!, '654321')
  await user.click(screen.getByRole('button', { name: 'ارسال کد تأیید' }))
  return view
}

describe('the authenticator code of a contact change', () => {
  it('a code sent spent it: «ارسال مجدد کد» goes back for the next one', async () => {
    const { user } = await fillRequest()
    await screen.findByRole('group', { name: 'کد تأیید' })
    expect(mocks.contactRequest).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'Firefly@1234', totp_code: '654321' }),
    )
    await act(() => vi.advanceTimersByTimeAsync(121_000))
    await user.click(screen.getByRole('button', { name: 'ارسال مجدد کد' }))
    // Back on the first step, the password kept, the authenticator's next code asked for.
    expect(await screen.findByLabelText('رمز فعلی', { selector: 'input' })).toHaveValue(
      'Firefly@1234',
    )
    for (const box of totpBoxes()) expect(box).toHaveValue('')
    expect(totpBoxes()[0]).toHaveFocus()
    expect(screen.getByText(/کد تازهٔ برنامه را وارد کنید/)).toBeInTheDocument()
    expect(mocks.contactRequest).toHaveBeenCalledOnce()
  })

  it('a send that failed (503) spent it too: the boxes empty, the password stays', async () => {
    const detail = 'ارسال کد تأیید ممکن نشد. لطفاً دوباره تلاش کنید.'
    mocks.contactRequest.mockRejectedValueOnce(apiError(503, 'auth_otp_send_failed', detail))
    await fillRequest()
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    for (const box of totpBoxes()) expect(box).toHaveValue('')
    expect(screen.getByText(/کد تازهٔ برنامه را وارد کنید/)).toBeInTheDocument()
    expect(screen.getByLabelText('رمز فعلی', { selector: 'input' })).toHaveValue('Firefly@1234')
  })

  it('a refused code (auth_totp_invalid): said under the boxes, which empty and take the focus', async () => {
    mocks.contactRequest.mockRejectedValueOnce(
      apiError(400, 'auth_totp_invalid', 'کد احراز هویت نامعتبر است.'),
    )
    await fillRequest()
    const group = screen.getByRole('group', { name: TOTP })
    await waitFor(() =>
      expect(group).toHaveAccessibleDescription(expect.stringContaining('کد احراز هویت نامعتبر')),
    )
    for (const box of totpBoxes()) expect(box).toHaveValue('')
    expect(totpBoxes()[0]).toHaveFocus()
  })
})
