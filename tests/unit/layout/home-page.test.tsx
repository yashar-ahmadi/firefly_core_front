import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShopHomePage from '@/app/(shop)/page'
import type { SiteSettings } from '@/lib/api/types/settings'

const mocks = vi.hoisted(() => ({ settings: null as SiteSettings | null }))

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({ getSiteSettings: async () => mocks.settings }))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'https://api.shop.ir/',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
      STORE_PRESET: 'carpet',
    }),
  )
  return { ...pure, getStoreConfig: () => config }
})

beforeEach(() => {
  mocks.settings = null
})

describe('home page placeholder', () => {
  it('is headed with the shop name from the settings', async () => {
    mocks.settings = { name: 'فرش مهر' } as SiteSettings
    render((await ShopHomePage()) as ReactNode)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('فرش مهر')
  })

  it('falls back to the preset label without settings', async () => {
    render((await ShopHomePage()) as ReactNode)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('فرش')
    expect(screen.queryByText('فروشگاه فایرفلای')).toBeNull()
  })
})
