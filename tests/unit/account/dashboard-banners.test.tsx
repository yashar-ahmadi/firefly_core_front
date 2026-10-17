import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardBanners } from '@/features/account/dashboard/dashboard-banners'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { banner, page } from './fixtures'

// The dashboard's promo banners (`dashboard/banner/list/`, public and viewer-blind): read on the
// server (a cached anonymous read, like the homepage's), shown as a carousel of the homepage's
// promo tiles. None live (the dev data has none): nothing at all.

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))

beforeEach(() => {
  stubBrowserApis()
  mocks.apiFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderBanners(banners: ReturnType<typeof banner>[]) {
  const { wrapper } = clientProviders({ hasSession: true })
  return render(<DashboardBanners banners={banners} />, { wrapper })
}

describe('DashboardBanners', () => {
  it('shows the live banners as a carousel of linked promo tiles', () => {
    renderBanners([
      banner(),
      banner({
        id: 2,
        title: '',
        subtitle: '',
        alt: 'هدیه تولد',
        link: 'https://blog.example.com/x',
      }),
    ])
    const carousel = screen.getByRole('region', { name: 'پیشنهادهای ویژه' })
    const slides = within(carousel).getAllByRole('group', { name: /از ۲$/ })
    expect(slides).toHaveLength(2)
    const first = within(slides[0]!).getByRole('link')
    expect(first).toHaveAttribute('href', '/product/list/autumn/')
    expect(first).toHaveTextContent('جشنواره پاییزه')
    expect(first).toHaveTextContent('تا ۳۰٪ تخفیف لوازم جانبی')
    expect(first).toHaveTextContent('مشاهده کنید')
    // An external link opens as a plain link; its picture is named by its alt text.
    const second = within(slides[1]!).getByRole('link')
    expect(second).toHaveAttribute('href', 'https://blog.example.com/x')
    expect(within(second).getByRole('img', { name: 'هدیه تولد' })).toBeVisible()
  })

  it('serves the mobile picture on phones when there is one, else the main one', () => {
    const { container } = renderBanners([
      banner({ mobile_image: 'http://localhost:8000/media/banners/autumn-m.jpg' }),
      banner({ id: 2 }),
    ])
    const pictures = container.querySelectorAll('picture')
    expect(pictures[0]!.querySelector('source')?.getAttribute('srcset')).toContain('autumn-m.jpg')
    expect(pictures[1]!.querySelector('source')).toBeNull()
  })

  it('is not clickable without a link, and shows nothing without a banner', () => {
    const { container, rerender } = renderBanners([banner({ link: ' ' })])
    expect(screen.queryByRole('link')).toBeNull()
    rerender(<DashboardBanners banners={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('getDashboardBanners', () => {
  async function load() {
    vi.resetModules()
    return (await import('@/features/account/dashboard/banners-api')).getDashboardBanners
  }

  it('reads the public list anonymously, cached for a minute', async () => {
    mocks.apiFetch.mockResolvedValue({ data: page([banner()]), msg: '', status: 200 })
    const getDashboardBanners = await load()
    expect(await getDashboardBanners()).toEqual([banner()])
    expect(mocks.apiFetch).toHaveBeenCalledWith('dashboard/banner/list/', {
      revalidate: 60,
      tags: ['dashboard-banners'],
      timeoutMs: 3500,
    })
  })

  it('gives no banner, logged once, when the list cannot be read or is malformed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const getDashboardBanners = await load()
    mocks.apiFetch.mockRejectedValueOnce(new Error('fetch failed'))
    expect(await getDashboardBanners()).toEqual([])
    mocks.apiFetch.mockResolvedValueOnce({ data: { results: 'x' }, msg: '', status: 200 })
    expect(await getDashboardBanners()).toEqual([])
    expect(log).toHaveBeenCalledTimes(2)
  })
})
