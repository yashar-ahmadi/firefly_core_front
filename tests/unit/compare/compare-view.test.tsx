import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompareView } from '@/features/compare/compare-view'
import { useCompare, type CompareItem } from '@/features/compare/store'
import { ApiError } from '@/lib/api/errors'
import type { ProductDetail } from '@/lib/api/types/catalog'
import { deferred } from '../cart/support'
import { s25Product } from '../product/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

stubBrowserApis()

const S25 = 'samsung-galaxy-s25-ultra'
const IPHONE = 'apple-iphone-16-pro-max'
const GONE = 'upcoming-flagship-2027'
const NAMES: Record<string, string> = {
  [S25]: 'گوشی موبایل سامسونگ گلکسی S25 اولترا',
  [IPHONE]: 'گوشی موبایل اپل آیفون ۱۶ پرو مکس',
  [GONE]: 'پرچمدار ۲۰۲۷',
}

const item = (slug: string): CompareItem => ({
  slug,
  name: NAMES[slug]!,
  image: 'https://api.shop.ir/media/x.jpg',
  categoryId: 10002,
})

const detail = (slug: string): ProductDetail =>
  s25Product({ id: slug === S25 ? 10001 : 10002, slug, name: NAMES[slug]! })

function save(slugs: string[]) {
  const items = slugs.map(item)
  localStorage.setItem('ff-compare', JSON.stringify({ state: { items }, version: 0 }))
  useCompare.setState({ items })
}

/** Answers each product read: the payload, or a 404 for GONE. */
function serve() {
  mocks.bffFetch.mockImplementation((path: string) => {
    const slug = path.split('/')[2]!
    if (slug === GONE) return Promise.reject(new ApiError({ status: 404, code: 'not_found' }))
    return Promise.resolve({ data: detail(slug), msg: '', status: 200 })
  })
}

/** The view under the page's heading, with one QueryClient for the test. */
function renderView() {
  const { wrapper: Base } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <h1 id="compare-heading" tabIndex={-1}>
        مقایسه کالاها
      </h1>
      {children}
    </Base>
  )
  return render(<CompareView headingId="compare-heading" />, { wrapper })
}

beforeEach(() => {
  localStorage.clear()
  useCompare.setState({ items: [] })
  mocks.bffFetch.mockReset()
})

describe('CompareView', () => {
  it('server-renders a loading shell, whatever this device saved', () => {
    save([S25, IPHONE])
    const { wrapper: Base } = clientProviders()
    const html = renderToString(
      <Base>
        <CompareView headingId="compare-heading" />
      </Base>,
    )
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('<table')
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('says when nothing was chosen, with a way home', async () => {
    renderView()
    expect(
      await screen.findByRole('heading', {
        name: 'هنوز کالایی برای مقایسه انتخاب نکرده\u{200C}اید',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /صفحه/ })).toHaveAttribute('href', '/')
  })

  it('reads the products through the BFF in parallel and lays them side by side', async () => {
    save([S25, IPHONE])
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.bffFetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    renderView()
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(2))
    expect(mocks.bffFetch.mock.calls.map(([path]) => path)).toEqual([
      `product/detail/${S25}/`,
      `product/detail/${IPHONE}/`,
    ])
    await act(async () => {
      first.resolve({ data: detail(S25), msg: '', status: 200 })
      second.resolve({ data: detail(IPHONE), msg: '', status: 200 })
    })
    const table = await screen.findByRole('table', { name: 'مقایسه کالاها' })
    expect(within(table).getByRole('link', { name: NAMES[S25] })).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: NAMES[IPHONE] })).toBeInTheDocument()
  })

  it('drops a product that no longer exists from the list, and says so', async () => {
    save([S25, GONE, IPHONE])
    serve()
    renderView()
    expect(await screen.findByRole('table', { name: 'مقایسه کالاها' })).toBeInTheDocument()
    await waitFor(() =>
      expect(useCompare.getState().items.map((listed) => listed.slug)).toEqual([S25, IPHONE]),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      `«${NAMES[GONE]}» دیگر موجود نیست و از فهرست مقایسه برداشته شد.`,
    )
  })

  it('removes a column and moves the focus to the next one; the last one to the heading', async () => {
    const user = userEvent.setup()
    save([S25, IPHONE])
    serve()
    renderView()
    const table = await screen.findByRole('table', { name: 'مقایسه کالاها' })
    const [first] = within(table).getAllByRole('button', { name: 'حذف از مقایسه' })
    await user.click(first!)
    expect(useCompare.getState().items.map((listed) => listed.slug)).toEqual([IPHONE])
    await waitFor(() =>
      expect(within(table).getByRole('button', { name: 'حذف از مقایسه' })).toHaveFocus(),
    )
    await user.click(within(table).getByRole('button', { name: 'حذف از مقایسه' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
    expect(screen.getByText('هنوز کالایی برای مقایسه انتخاب نکرده\u{200C}اید')).toBeInTheDocument()
  })

  it('asks for a second product while only one is listed', async () => {
    save([S25])
    serve()
    renderView()
    expect(await screen.findByRole('table', { name: 'مقایسه کالاها' })).toBeInTheDocument()
    expect(screen.getByText(/دست\u{200C}کم یک کالای دیگر/u)).toBeInTheDocument()
  })

  it('keeps the products that loaded when one fails, with a retry in its column', async () => {
    save([S25, IPHONE])
    mocks.bffFetch.mockImplementation((path: string) =>
      path.includes(IPHONE)
        ? Promise.reject(new ApiError({ status: 429, code: 'throttled' }))
        : Promise.resolve({ data: detail(S25), msg: '', status: 200 }),
    )
    renderView()
    const table = await screen.findByRole('table', { name: 'مقایسه کالاها' })
    expect(within(table).getByRole('link', { name: NAMES[S25] })).toBeInTheDocument()
    expect(within(table).getByText('اطلاعات این کالا دریافت نشد.')).toBeInTheDocument()
    serve()
    await userEvent.click(within(table).getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() =>
      expect(within(table).queryByText('اطلاعات این کالا دریافت نشد.')).toBeNull(),
    )
    expect(within(table).getAllByRole('button', { name: 'حذف از مقایسه' })).toHaveLength(2)
  })

  it('turns «فقط تفاوت‌ها» off in effect when a removal leaves one product', async () => {
    const user = userEvent.setup()
    save([S25, IPHONE])
    serve()
    renderView()
    const table = await screen.findByRole('table', { name: 'مقایسه کالاها' })
    // Both payloads are the S25's: every row is the same.
    await user.click(screen.getByRole('switch', { name: 'فقط تفاوت\u{200C}ها' }))
    expect(within(table).queryByRole('row', { name: /^رنگ/ })).toBeNull()
    await user.click(within(table).getAllByRole('button', { name: 'حذف از مقایسه' })[1]!)
    expect(within(table).getByRole('row', { name: /^رنگ/ })).toBeInTheDocument()
  })
})
