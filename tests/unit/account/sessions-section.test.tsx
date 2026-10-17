import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionsSection } from '@/features/account/profile/sessions-section'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'

// «خروج از همهٔ دستگاه‌ها» (auth digest §4.11, F6): every session of the account ends, this one
// too, so it asks first, in a dialog that keeps the focus.

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  logoutAll: vi.fn(),
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: { logout: mocks.logout, logoutAll: mocks.logoutAll },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => true, notify: mocks.notify }))

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  mocks.logoutAll.mockResolvedValue({})
  mocks.bffFetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
})

function renderSection() {
  const user = userEvent.setup()
  render(<SessionsSection />, { wrapper: authProviders({ hasSession: true }).wrapper })
  return user
}

const NAME = 'خروج از همهٔ دستگاه‌ها'

describe('SessionsSection', () => {
  it('asks first; «انصراف» closes the dialog, back on the button, nobody logged out', async () => {
    const user = renderSection()
    expect(screen.getByRole('region', { name: 'نشست‌ها' })).toBeInTheDocument()
    const open = screen.getByRole('button', { name: NAME })
    await user.click(open)
    const dialog = await screen.findByRole('dialog', { name: 'از همهٔ دستگاه‌ها خارج می‌شوید؟' })
    const cancel = screen.getByRole('button', { name: 'انصراف' })
    expect(cancel).toHaveFocus()
    // The focus stays in the dialog.
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.tab()
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await user.click(screen.getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(open).toHaveFocus()
    expect(mocks.logoutAll).not.toHaveBeenCalled()
  })

  it('confirmed: logout-all, then home with a toast', async () => {
    const user = renderSection()
    await user.click(screen.getByRole('button', { name: NAME }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'خروج از همه' }))
    await waitFor(() => expect(mocks.logoutAll).toHaveBeenCalledOnce())
    expect(mocks.logout).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/'))
    expect(mocks.notify.success).toHaveBeenCalledWith('از حساب خارج شدید')
  })
})
