import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ComparePage, { generateMetadata } from '@/app/(shop)/compare/page'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

const mocks = vi.hoisted(() => ({ compare: true }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = () => {
    const resolved = pure.resolveStoreConfig(
      parseServerEnv({
        FIREFLY_API_URL: 'https://api.shop.ir/',
        SITE_URL: 'https://shop.ir/',
        FIREFLY_API_KEY: 'k',
      }),
    )
    return { ...resolved, features: { ...resolved.features, compare: mocks.compare } }
  }
  return { ...pure, getStoreConfig: config }
})

beforeEach(() => {
  mocks.compare = true
})

describe('/compare/', () => {
  it('is titled and never indexed', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('مقایسه کالاها')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(meta.alternates?.canonical).toBe('/compare/')
  })

  it('renders the page heading, focusable from code (the focus target once the list empties)', async () => {
    const { wrapper } = clientProviders()
    render(await resolveServerTree(ComparePage()), { wrapper })
    expect(screen.getByRole('heading', { level: 1, name: 'مقایسه کالاها' })).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })

  it('is not found while comparison is switched off', () => {
    mocks.compare = false
    expect(() => ComparePage()).toThrow('NEXT_NOT_FOUND')
  })
})
