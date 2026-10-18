import { screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WalletRoute, { dynamic, metadata } from '@/app/(shop)/account/wallet/page'
import { catalog } from '../payment/fixtures'
import { resolveServerTree } from '../support/server-tree'
import { renderWallet } from './wallet-support'

// `/account/wallet/` on the server: inside the account layout (its guard, its shell, noindex),
// rendered per request, titled «کیف پول», no loading.tsx; the payment catalog (the server's
// cached, anonymous copy: the gateways) and the support line for the top-up box. The wallet
// itself is read in the browser through the BFF.

vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
  useSearchParams: () => new URLSearchParams(),
}))
const mocks = vi.hoisted(() => ({ catalog: vi.fn() }))
vi.mock('@/features/payment/catalog', () => ({ getPaymentCatalog: mocks.catalog }))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.catalog.mockResolvedValue(catalog())
})

describe('/account/wallet/', () => {
  it('titled «کیف پول» (noindex: the account layout), rendered per request', () => {
    expect(metadata).toEqual({ title: 'کیف پول' })
    expect(dynamic).toBe('force-dynamic')
  })

  it('the page with its heading; the catalog read on the server (once)', async () => {
    renderWallet(await resolveServerTree(WalletRoute()))
    expect(screen.getByRole('heading', { level: 1, name: 'کیف پول' })).toBeVisible()
    expect(mocks.catalog).toHaveBeenCalledTimes(1)
  })

  it('has no loading.tsx (R9)', () => {
    const dir = join(process.cwd(), 'src/app/(shop)/account/wallet')
    expect(existsSync(join(dir, 'loading.tsx'))).toBe(false)
  })
})
