import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwoFactorSection } from '@/features/account/profile/two-factor-section'
import { TOTP_STATUS_KEY } from '@/features/account/profile/use-totp-status'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import { apiError, renderWithMe, saraWith } from './profile-support'

// Two-step login with an authenticator app (auth digest §4.19, F10): the status from its own
// endpoint; setup shows the QR code and the key, a code enables; a code disables. The key never
// outlives the setup on screen.

const mocks = vi.hoisted(() => ({
  totpStatus: vi.fn(),
  totpSetup: vi.fn(),
  totpEnable: vi.fn(),
  totpDisable: vi.fn(),
  bffFetch: vi.fn(),
  announce: vi.fn(),
  writeText: vi.fn(),
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    totpStatus: mocks.totpStatus,
    totpSetup: mocks.totpSetup,
    totpEnable: mocks.totpEnable,
    totpDisable: mocks.totpDisable,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))

const SETUP = {
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  qr_code: 'data:image/png;base64,iVBORw0KGgo=',
  provisioning_uri: 'otpauth://totp/Firefly:sara?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
}

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.totpStatus.mockResolvedValue({ is_totp_enabled: false })
  mocks.totpSetup.mockResolvedValue(SETUP)
  mocks.totpEnable.mockResolvedValue({})
  mocks.totpDisable.mockResolvedValue({})
  mocks.writeText.mockResolvedValue(undefined)
})

/** The page's clipboard (after `userEvent.setup()`, which installs a stub of its own). */
function stubClipboard(value: { writeText: typeof mocks.writeText } | undefined) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

afterEach(() => {
  vi.useRealTimers()
})

const codeBoxes = () =>
  within(screen.getByRole('group', { name: 'کد برنامهٔ احراز هویت' })).getAllByRole('textbox')

function renderSection(enabled = false) {
  mocks.totpStatus.mockResolvedValue({ is_totp_enabled: enabled })
  return renderWithMe(() => <TwoFactorSection />, { me: saraWith({ is_totp_enabled: enabled }) })
}

/** sara starts the setup; the QR code is on screen. */
async function toSetup() {
  const view = renderSection()
  await view.user.click(await screen.findByRole('button', { name: 'فعال‌سازی ورود دومرحله‌ای' }))
  await screen.findByRole('img', { name: 'کد QR برای افزودن حساب به برنامهٔ احراز هویت' })
  stubClipboard({ writeText: mocks.writeText })
  return view
}

describe('TwoFactorSection', () => {
  it('reads the status from its endpoint (a skeleton until it answers)', async () => {
    let answer: (value: { is_totp_enabled: boolean }) => void = () => {}
    mocks.totpStatus.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    renderWithMe(() => <TwoFactorSection />)
    const section = screen.getByRole('region', { name: 'ورود دومرحله‌ای' })
    expect(section).toHaveAttribute('aria-busy', 'true')
    await act(async () => answer({ is_totp_enabled: true }))
    expect(await within(section).findByText('فعال')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'غیرفعال‌سازی' })).toBeInTheDocument()
    expect(section).not.toHaveAttribute('aria-busy')
  })

  it('setup shows the QR code and the key, which copies to the clipboard', async () => {
    const { user } = await toSetup()
    const qr = screen.getByRole('img', { name: 'کد QR برای افزودن حساب به برنامهٔ احراز هویت' })
    expect(qr).toHaveAttribute('src', SETUP.qr_code)
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument()
    // No link carries the key (an otpauth:// URL is the secret in a URL).
    expect(document.querySelector('a[href^="otpauth:"]')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'کپی کلید' }))
    expect(mocks.writeText).toHaveBeenCalledWith(SETUP.secret)
    expect(await screen.findByText('کلید کپی شد.')).toBeInTheDocument()
    expect(mocks.announce).toHaveBeenCalledWith('کلید کپی شد.')
  })

  it('without a clipboard, the key is selected for the visitor to copy', async () => {
    const { user } = await toSetup()
    stubClipboard(undefined)
    await user.click(screen.getByRole('button', { name: 'کپی کلید' }))
    expect(await screen.findByText('کلید انتخاب شد؛ آن را کپی کنید.')).toBeInTheDocument()
    expect(window.getSelection()?.toString().replace(/\s/g, '')).toBe(SETUP.secret)
  })

  it('a code enables it: the status, ["me"] and the screen follow; the key is gone', async () => {
    const { user, client } = await toSetup()
    await user.type(codeBoxes()[0]!, '۴۹۲۰۳۹')
    await waitFor(() => expect(mocks.totpEnable).toHaveBeenCalledWith({ totp_code: '492039' }))
    expect(await screen.findByText('ورود دومرحله‌ای فعال شد.')).toBeInTheDocument()
    expect(mocks.announce).toHaveBeenCalledWith('ورود دومرحله‌ای فعال شد.')
    expect(client.getQueryData(TOTP_STATUS_KEY)).toEqual({ is_totp_enabled: true })
    expect(client.getQueryData(ME_KEY)).toMatchObject({ is_totp_enabled: true })
    expect(screen.queryByText(/JBSW/)).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'غیرفعال‌سازی' })).toBeInTheDocument()
    // Nothing of the setup is cached anywhere.
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(SETUP.secret)
    expect(client.getMutationCache().getAll()).toHaveLength(0)
  })

  it('«انصراف» forgets the key', async () => {
    const { user } = await toSetup()
    await user.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(screen.queryByText(/JBSW/)).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'فعال‌سازی ورود دومرحله‌ای' })).toHaveFocus()
    expect(mocks.totpEnable).not.toHaveBeenCalled()
  })

  it('a wrong code is said and emptied; auth_totp_locked holds the button for retry_after', async () => {
    mocks.totpEnable
      .mockRejectedValueOnce(apiError(400, 'auth_totp_invalid', 'کد احراز هویت نامعتبر است.'))
      .mockRejectedValueOnce(
        apiError(429, 'auth_totp_locked', 'تلاش‌های ناموفق زیاد بود.', { retryAfter: 120 }),
      )
    const { user } = await toSetup()
    await user.type(codeBoxes()[0]!, '111111')
    expect(await screen.findByText('کد احراز هویت نامعتبر است.')).toBeInTheDocument()
    for (const box of codeBoxes()) expect(box).toHaveValue('')
    expect(codeBoxes()[0]).toHaveFocus()

    await user.type(codeBoxes()[0]!, '222222')
    expect(await screen.findByText('تلاش‌های ناموفق زیاد بود.')).toBeInTheDocument()
    const enable = screen.getByRole('button', { name: 'فعال‌سازی' })
    await waitFor(() => expect(enable).toHaveAttribute('aria-disabled', 'true'))
    expect(enable).toHaveAccessibleDescription('زمان باقی‌مانده تا تلاش دوباره: ۰۲:۰۰')
    await user.type(codeBoxes()[0]!, '333333')
    expect(mocks.totpEnable).toHaveBeenCalledTimes(2)

    await act(() => vi.advanceTimersByTimeAsync(121_000))
    await user.click(enable)
    await waitFor(() => expect(mocks.totpEnable).toHaveBeenCalledTimes(3))
  })

  it('disables with a code', async () => {
    const { user, client } = renderSection(true)
    await user.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی' }))
    await user.type(codeBoxes()[0]!, '777777')
    await waitFor(() => expect(mocks.totpDisable).toHaveBeenCalledWith({ totp_code: '777777' }))
    expect(await screen.findByText('ورود دومرحله‌ای غیرفعال شد.')).toBeInTheDocument()
    expect(client.getQueryData(TOTP_STATUS_KEY)).toEqual({ is_totp_enabled: false })
    expect(client.getQueryData(ME_KEY)).toMatchObject({ is_totp_enabled: false })
    expect(screen.getByRole('button', { name: 'فعال‌سازی ورود دومرحله‌ای' })).toBeInTheDocument()
  })

  it('reads the status again when it was stale (auth_already_verified on setup)', async () => {
    mocks.totpSetup.mockRejectedValue(
      apiError(400, 'auth_already_verified', 'احراز هویت دو مرحله‌ای قبلاً فعال شده است.'),
    )
    const { user } = renderSection()
    mocks.totpStatus.mockResolvedValue({ is_totp_enabled: true })
    await user.click(await screen.findByRole('button', { name: 'فعال‌سازی ورود دومرحله‌ای' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('قبلاً فعال شده است')
    expect(await screen.findByRole('button', { name: 'غیرفعال‌سازی' })).toBeInTheDocument()
  })
})
