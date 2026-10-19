import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductPage from '@/app/(shop)/product/[slug]/page'
import { FeatureProvider } from '@/features/settings/feature-context'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { s25Product } from './fixtures'
import { resetRouter } from './router'

// The operator's `product` message slot (Plan 5 Task 5): on every product page, under the
// gallery, the summary and the buy box (on phones right under the buy box, as they read), before
// the sections' bar; server HTML only. Without the slot, nothing of it.

const mocks = vi.hoisted(() => ({ slot: null as unknown }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', async () => ({
  ...(await import('./router')).routerMock,
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('@/features/catalog/api', () => ({
  getProductDetail: async () => s25Product(),
  getProductSettings: async () => ({
    paginator_number: 24,
    show_out_of_stock_label: true,
    related_items_display_status: true,
    related_items_number: 8,
  }),
  getFirstComments: async () => ({ count: 0, results: [], next: null, previous: null }),
}))
vi.mock('@/features/content/dynamic/api', () => ({
  getDynamicContent: async (key: string) => (key === 'product' ? mocks.slot : null),
}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({ FIREFLY_API_URL: 'https://api.shop.ir/', SITE_URL: 'https://shop.ir/' }),
  )
  return { ...pure, getStoreConfig: () => config }
})

stubBrowserApis()

async function renderPage() {
  const { wrapper: Base } = clientProviders()
  const props = { params: Promise.resolve({ slug: 'samsung-galaxy-s25-ultra' }) }
  const tree = await resolveServerTree((await ProductPage(props)) as ReactNode)
  return render(
    <Base>
      <FeatureProvider initial={{}}>{tree}</FeatureProvider>
    </Base>,
  )
}

beforeEach(() => {
  resetRouter()
  mocks.slot = null
})

describe('the product page’s message slot', () => {
  it('sits under the buy box, before the sections', async () => {
    mocks.slot = {
      page_type: 1,
      page_type_key: 'product',
      page_display_name: 'پیام صفحهٔ کالا',
      descriptions: [
        { id: 1, title: null, content: '<p>ارسال رایگان برای خرید بالای ۱۰ میلیون.</p>' },
      ],
      warnings: [],
    }
    const { container } = await renderPage()
    const slot = container.querySelector('[data-slot="product"]')!
    expect(slot).toHaveTextContent('ارسال رایگان برای خرید بالای ۱۰ میلیون.')
    const buyBox = screen.getByRole('region', { name: 'خرید' })
    expect(buyBox.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const reviews = container.querySelector('#reviews')!
    expect(slot.compareDocumentPosition(reviews) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('without the slot, nothing of it', async () => {
    const { container } = await renderPage()
    expect(container.querySelector('[data-slot]')).toBeNull()
  })
})
