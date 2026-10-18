import { render, screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PayLinkNotFound, {
  generateMetadata as notFoundMetadata,
} from '@/app/(checkout)/order/pay/[token]/not-found'
import PayLinkRoute, { dynamic, generateMetadata } from '@/app/(checkout)/order/pay/[token]/page'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import invalid from '../../fixtures/order-pay-link-invalid.json'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { catalog, LINK_TOKEN } from './fixtures'
import { payLink } from './link-fixtures'

// `/order/pay/<token>/` on the server (order digest §3.1.9, §8.2): the order read once per request
// (shared with the metadata) with the visitor's IP; a token of the wrong shape never reaches the
// API; an unknown token (or a cancelled order's) is a real 404 with its own calm page; every
// other refusal is a calm page with what happened and what to do next. Titled with the order's
// code, never indexed, no canonical (its URL holds the token), rendered per request, no loading.tsx.

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '203.0.113.9' }),
}))
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  usePathname: () => `/order/pay/${LINK_TOKEN}/`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/config/env', () => ({ getServerEnv: () => ({ CLIENT_IP_HEADER: 'x-real-ip' }) }))
vi.mock('@/features/payment/catalog', () => ({ getPaymentCatalog: async () => catalog() }))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
  getTranslations: async () => ({}),
}))
vi.mock('@/features/seo/shop-name', () => ({ shopName: async () => 'فایرفلای' }))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ name: 'فایرفلای', siteUrl: 'http://localhost:3000' }),
}))

const params = (token = LINK_TOKEN) => ({ params: Promise.resolve({ token }) })
const refuse = (status: number, code: string, detail = 'جمله\u{0654} سرور.') =>
  mocks.apiFetch.mockRejectedValue(new ApiError({ status, code, detail }))

async function show(token = LINK_TOKEN) {
  const { wrapper: Wrapper } = clientProviders()
  render(await resolveServerTree(PayLinkRoute(params(token))), {
    wrapper: ({ children }) => (
      <FeatureProvider initial={{}}>
        <Wrapper>{children}</Wrapper>
      </FeatureProvider>
    ),
  })
}

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.notFound.mockClear()
  mocks.apiFetch.mockResolvedValue({
    data: payLink(),
    msg: '',
    status: 200,
    headers: new Headers(),
  })
})

describe('/order/pay/<token>/', () => {
  it('reads the order once, with the visitor’s IP, never cached; titled with its code', async () => {
    const meta = await generateMetadata(params())
    expect(meta.title).toBe('پرداخت سفارش ۱۴۱۱۶۳۵۳۴۰')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(meta.alternates?.canonical).toBeUndefined()
    expect(JSON.stringify(meta)).not.toContain(LINK_TOKEN)
    expect(dynamic).toBe('force-dynamic')
    const [path, init] = mocks.apiFetch.mock.calls[0]!
    expect(path).toBe(`order/pay/${LINK_TOKEN}/`)
    expect(init).toMatchObject({ forwardedFor: '203.0.113.9' })
    expect(init.revalidate).toBeUndefined()
  })

  it('shows the order and its routes when the link opens', async () => {
    await show()
    expect(await screen.findByRole('heading', { level: 1, name: 'پرداخت سفارش' })).toBeVisible()
    expect(await screen.findByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })).toBeVisible()
  })

  it('a token of the wrong shape is a 404 without asking the API', async () => {
    await expect(PayLinkRoute(params('not.a token'))).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(PayLinkRoute(params('short'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.apiFetch).not.toHaveBeenCalled()
  })

  it('an unknown token (or a cancelled order’s) is a real 404; its page is calm and says why', async () => {
    mocks.apiFetch.mockRejectedValue(ApiError.fromBody(404, invalid))
    await expect(PayLinkRoute(params())).rejects.toThrow('NEXT_NOT_FOUND')
    const { wrapper } = clientProviders()
    render(await resolveServerTree(PayLinkNotFound()), { wrapper })
    expect(screen.getByRole('heading', { name: 'لینک معتبر نیست' })).toBeVisible()
    expect(screen.getByText(/سفارش آن لغو شده است/)).toBeVisible()
    expect(screen.getByRole('link', { name: /پیگیری سفارش/ })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(screen.getByRole('link', { name: /پشتیبانی/ })).toHaveAttribute(
      'href',
      'tel:+982191000000',
    )
    expect((await notFoundMetadata()).title).toEqual({ absolute: 'لینک معتبر نیست | فایرفلای' })
  })

  it.each([
    [410, 'order_payment_link_expired', 'مهلت پرداخت تمام شده', /پیش\u{200C}تر پرداخت کرده/u],
    [409, 'order_already_settled', 'پرداخت آنلاین این سفارش انجام شده', /به پیک بپردازید/],
    [
      409,
      'order_collected_on_delivery',
      'سفارش تأیید شده؛ مبلغ هنگام تحویل',
      /آن را هنگام تحویل بپردازید/,
    ],
    [409, 'order_not_payable', 'سفارش فعلاً قابل پرداخت نیست', /رسید کارت به کارت/],
  ])(
    '%i %s: a calm page with the API’s sentence, tracking and support',
    async (status, code, title, note) => {
      refuse(status, code, 'جمله\u{0654} سرور.')
      await show()
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible()
      expect(screen.getByText('جمله\u{0654} سرور.')).toBeVisible()
      expect(screen.getByText(note)).toBeVisible()
      expect(screen.getByRole('link', { name: /پیگیری سفارش/ })).toHaveAttribute(
        'href',
        '/order/track/',
      )
      expect(screen.getByRole('link', { name: /پشتیبانی/ })).toBeVisible()
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
      expect((await generateMetadata(params())).title).toBe(title)
    },
  )

  it('a 429: wait, and the page again (a full load)', async () => {
    mocks.apiFetch.mockRejectedValue(
      new ApiError({ status: 429, code: 'throttled', detail: 'زیاد.', retryAfter: 42 }),
    )
    await show()
    expect(screen.getByRole('heading', { name: 'کمی صبر کنید' })).toBeVisible()
    expect(screen.getByText(/۴۲ ثانیه/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'تلاش دوباره' })).toHaveAttribute(
      'href',
      `/order/pay/${LINK_TOKEN}/`,
    )
  })

  it('no answer: said, logged without the token, with the page again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiFetch.mockRejectedValue(ApiError.network())
    await show()
    expect(screen.getByRole('heading', { name: 'لینک پرداخت اکنون خوانده نشد' })).toBeVisible()
    expect(error).toHaveBeenCalled()
    expect(JSON.stringify(error.mock.calls)).not.toContain(LINK_TOKEN)
    error.mockRestore()
  })

  it('has no loading.tsx (it would turn the 404 into a soft 200)', () => {
    const dir = 'src/app/(checkout)/order/pay/[token]/'
    for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
      expect(existsSync(join(process.cwd(), dir, name)), `${dir}${name}`).toBe(false)
    }
  })
})
