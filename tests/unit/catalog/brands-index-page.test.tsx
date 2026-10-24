import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BrandsPage, { generateMetadata as brandsMetadata } from '@/app/(shop)/brand/page'
import type { BrandCard } from '@/lib/api/types/catalog'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// `/brand/` (the brands index): every brand A to Z, its trail as BreadcrumbList JSON-LD,
// indexable. Moved out of listing-pages.test.tsx (Plan 5 Task 8: files ≲ 250 lines).

const mocks = vi.hoisted(() => ({ getBrands: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/features/catalog/api', () => ({ getBrands: mocks.getBrands }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = () =>
    pure.resolveStoreConfig(
      parseServerEnv({
        FIREFLY_API_URL: 'https://api.shop.ir/',
        SITE_URL: 'https://shop.ir/',
        FIREFLY_API_KEY: 'k',
      }),
    )
  return { ...pure, getStoreConfig: config }
})

async function show(tree: Promise<unknown> | unknown) {
  const { wrapper } = clientProviders()
  return render(await resolveServerTree((await tree) as ReactNode), { wrapper })
}

function brandCard(id: number, name: string, slug: string, product_count = 1): BrandCard {
  return {
    id,
    name,
    slug,
    image: 'http://localhost:8000/static/defaults/default.png',
    product_count,
    created: '',
    updated: '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getBrands.mockResolvedValue([])
})

describe('the brands index', () => {
  it('lists every brand in Persian alphabetical order, linked to its page', async () => {
    mocks.getBrands.mockResolvedValue([
      brandCard(1, 'هایسنس', 'hisense', 3),
      brandCard(2, 'پاناسونیک', 'panasonic', 1),
      brandCard(3, 'اپل', 'apple', 6),
    ])
    await show(BrandsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'برندها' })).toBeInTheDocument()
    const links = within(screen.getByRole('list', { name: 'برندها' })).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/brand/apple/',
      '/brand/panasonic/',
      '/brand/hisense/',
    ])
    expect(links[0]).toHaveTextContent('اپل')
    expect(links[0]).toHaveTextContent('۶ کالا')
  })

  it('its trail (home › «برندها») is its BreadcrumbList JSON-LD, on the shop’s origin', async () => {
    mocks.getBrands.mockResolvedValue([brandCard(3, 'اپل', 'apple', 6)])
    const { container } = await show(BrandsPage())
    const blocks = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => JSON.parse(script.textContent ?? ''),
    )
    expect(blocks).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://shop.ir/' },
          { '@type': 'ListItem', position: 2, name: 'برندها', item: 'https://shop.ir/brand/' },
        ],
      },
    ])
  })

  it('is titled «برندها» and indexable', async () => {
    const meta = await brandsMetadata()
    expect(meta.title).toBe('برندها')
    expect(meta.alternates).toEqual({ canonical: '/brand/' })
    expect(meta).not.toHaveProperty('robots')
    expect(meta.openGraph).toMatchObject({ siteName: 'فایرفلای' })
  })
})
