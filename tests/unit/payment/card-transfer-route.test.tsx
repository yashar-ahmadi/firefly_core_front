import { render, screen } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CardTransferNotFound, {
  generateMetadata as notFoundMetadata,
} from '@/app/(checkout)/payment/card-transfer/[uuid]/not-found'
import CardTransferRoute, {
  dynamic,
  generateMetadata,
} from '@/app/(checkout)/payment/card-transfer/[uuid]/page'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { catalog, method, PAYMENT_UUID } from './fixtures'

// `/payment/card-transfer/<uuid>/` on the server (order digest §5.7; Plan 4 Global Constraints):
// in the checkout's quiet frame, rendered per request, never indexed, no canonical (its URL holds
// the payment's uuid), a real title, no loading.tsx (R9); a uuid of the wrong shape is a real 404
// without asking the API; the route's instruction comes sanitised from the server's catalog. The
// cards are read in the browser (the island's first words render meanwhile).

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(() => new Promise(() => {})),
  catalog: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  usePathname: () => '/payment/card-transfer/x/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/payment/catalog', () => ({ getPaymentCatalog: mocks.catalog }))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
  getTranslations: async () => ({}),
}))
vi.mock('@/features/seo/shop-name', () => ({ shopName: async () => 'فایرفلای' }))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ name: 'فایرفلای', siteUrl: 'http://localhost:3000' }),
}))

const DIR = 'src/app/(checkout)/payment/card-transfer/[uuid]/'
const params = (uuid = PAYMENT_UUID) => ({ params: Promise.resolve({ uuid }) })

beforeEach(() => {
  mocks.bffFetch.mockClear()
  mocks.notFound.mockClear()
  mocks.catalog.mockResolvedValue(catalog())
})

describe('/payment/card-transfer/<uuid>/', () => {
  it('is dynamic, never indexed, without a canonical, titled «پرداخت کارت به کارت»', async () => {
    expect(dynamic).toBe('force-dynamic')
    const meta = await generateMetadata(params())
    expect(meta.title).toBe('پرداخت کارت به کارت')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(meta.alternates?.canonical).toBeUndefined()
    expect(JSON.stringify(meta)).not.toContain(PAYMENT_UUID)
  })

  it('renders the island’s first words while the cards are read in the browser', async () => {
    const { wrapper } = clientProviders()
    render(await resolveServerTree(CardTransferRoute(params())), { wrapper })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'پرداخت کارت به کارت' }),
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('در حال خواندن اطلاعات پرداخت')
  })

  it('a uuid of the wrong shape is a 404 without asking the API; its page is calm', async () => {
    for (const uuid of ['not-a-uuid', '0b6f5a9e-3c1d-4f7a-9e2b-1a2b3c4d5e6', '../status']) {
      await expect(CardTransferRoute(params(uuid))).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(mocks.bffFetch).not.toHaveBeenCalled()
    expect(mocks.catalog).not.toHaveBeenCalled()
    const { wrapper } = clientProviders()
    render(await resolveServerTree(CardTransferNotFound()), { wrapper })
    expect(screen.getByRole('heading', { level: 1, name: 'این پرداخت پیدا نشد' })).toBeVisible()
    expect(screen.getByRole('link', { name: /پیگیری سفارش/ })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(screen.getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })).toHaveAttribute(
      'href',
      'tel:+982191000000',
    )
    expect((await notFoundMetadata()).title).toEqual({
      absolute: 'این پرداخت پیدا نشد | فایرفلای',
    })
  })

  it('hands the island the route’s instruction from the server’s sanitised catalog', async () => {
    mocks.catalog.mockResolvedValue(
      catalog({
        methods: [{ ...method('card_transfer'), description: null, instruction: '<p>امن</p>' }],
      }),
    )
    const tree = await resolveServerTree(CardTransferRoute(params()))
    expect(JSON.stringify(tree)).toContain('<p>امن</p>')
  })

  it('sits in the checkout frame, has no loading.tsx and logs nothing', () => {
    const source = readFileSync(join(process.cwd(), DIR, 'page.tsx'), 'utf8')
    expect(source).not.toMatch(/console\./)
    for (const dir of [
      DIR,
      'src/app/(checkout)/payment/card-transfer/',
      'src/app/(checkout)/payment/',
    ]) {
      for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
        expect(existsSync(join(process.cwd(), dir, name)), `${dir}${name}`).toBe(false)
      }
    }
  })
})
