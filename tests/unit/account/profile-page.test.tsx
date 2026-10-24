import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { SARA } from '../auth/fixtures'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { ok } from './fixtures'

// `/account/profile/`: one card per concern, each a region with its heading, each with its own
// skeleton while the profile (`['me']`) loads.

const mocks = vi.hoisted(() => ({ me: vi.fn(), totpStatus: vi.fn() }))
vi.mock('@/lib/api/client', () => ({
  bffFetch: async (path: string) => {
    if (path === 'account/profile/me/') return ok(await mocks.me())
    if (path === 'account/profile/totp/status/') return ok(await mocks.totpStatus())
    throw new Error(`unexpected ${path}`)
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/account/profile/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const SECTIONS = [
  'نام و نام خانوادگی',
  'تصویر پروفایل',
  'ایمیل و شمارهٔ موبایل',
  'رمز عبور',
  'ورود دومرحله‌ای',
  'نشست‌ها',
]

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  mocks.me.mockResolvedValue(SARA)
  mocks.totpStatus.mockResolvedValue({ is_totp_enabled: false })
})

async function renderPage() {
  const { default: ProfileRoute, metadata } = await import('@/app/(shop)/account/profile/page')
  render(<ProfileRoute />, { wrapper: authProviders({ hasSession: true }).wrapper })
  return metadata
}

describe('the profile page', () => {
  it('is «اطلاعات حساب», with a region per section, each with its heading', async () => {
    const metadata = await renderPage()
    expect(metadata.title).toBe('اطلاعات حساب')
    expect(screen.getByRole('heading', { level: 1, name: 'اطلاعات حساب' })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'نام' })).toHaveValue('سارا')
    for (const name of SECTIONS) {
      const region = screen.getByRole('region', { name })
      expect(within(region).getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('shows each section’s skeleton while the profile loads', async () => {
    let answer: (me: typeof SARA) => void = () => {}
    mocks.me.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await renderPage()
    for (const name of SECTIONS.slice(0, 4)) {
      expect(screen.getByRole('region', { name })).toHaveAttribute('aria-busy', 'true')
    }
    expect(screen.queryByRole('textbox')).toBeNull()
    await act(async () => answer(SARA))
    expect(await screen.findByRole('textbox', { name: 'نام' })).toHaveValue('سارا')
    expect(screen.getByRole('region', { name: 'نام و نام خانوادگی' })).not.toHaveAttribute(
      'aria-busy',
    )
  })

  it('offers «تلاش دوباره» when the profile cannot be read; sessions stay', async () => {
    // A 4xx: not retried, so the error shows at once (a 5xx is retried twice first).
    mocks.me.mockRejectedValue(new ApiError({ status: 400, code: 'bad_request' }))
    await renderPage()
    expect(await screen.findByText('اطلاعات حساب بارگذاری نشد.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'نشست‌ها' })).toBeInTheDocument()
  })
})
