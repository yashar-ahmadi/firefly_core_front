import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrdersPage } from '@/features/orders/account/orders-page'
import type { QueryInit } from '@/lib/api/envelope'
import { catalog } from '../payment/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import { ORDERS, ok, page, refuse, renderAccount, summary } from './account-support'

// «سفارش‌های من» (order digest §3.1.2, §6.1, §6.3; dashboard digest §3.2–3.4): tabs from the
// summary's `orders.groups` (labels as given, with counts, «همه» first; a key the code does not
// know is a tab too), `?group=` in the URL as the API's `status_group`, the sort and the pages;
// nothing the API would refuse is sent. Each order a card (an article with its heading).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), search: '' }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/orders/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

type Init = { query?: QueryInit }
let listAnswer: (query: QueryInit) => Promise<unknown>
let summaryAnswer: () => Promise<unknown>
let history = spyOnHistory()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  history = spyOnHistory()
  mocks.search = ''
  listAnswer = () => ok(ORDERS())
  summaryAnswer = () => ok(summary())
  mocks.bffFetch.mockImplementation((path: string, init: Init = {}) => {
    if (path === 'dashboard/summary/') return summaryAnswer()
    if (path === 'order/list/') return listAnswer(init.query ?? {})
    return new Promise(() => {})
  })
})

const reads = () =>
  mocks.bffFetch.mock.calls
    .filter(([path]) => path === 'order/list/')
    .map(([, init]) => (init as Init).query ?? {})
const renderOrders = () =>
  renderAccount(<OrdersPage title="سفارش‌های من" catalog={catalog()} supportPhone={null} />)
const tabs = () => screen.getByRole('navigation', { name: 'گروه سفارش‌ها' })

describe('the tabs', () => {
  it('«همه» and the summary’s groups, labels as given, with counts; the current one marked', async () => {
    renderOrders()
    const nav = await screen.findByRole('navigation', { name: 'گروه سفارش‌ها' })
    await within(nav).findByRole('link', { name: /^لغو شده/ })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'همه۶',
      'در انتظار پرداخت۱',
      'جاری۱',
      'تحویل داده شده۴',
      'مرجوعی۰',
      'لغو شده۰',
    ])
    expect(links[0]).toHaveAttribute('aria-current', 'page')
    expect(links[2]).toHaveAttribute('href', '/account/orders/?group=in_progress')
  })

  it('?group=in_progress: the list read with that status_group at once', async () => {
    mocks.search = 'group=in_progress'
    renderOrders()
    await waitFor(() => expect(reads()).toEqual([{ status_group: 'in_progress' }]))
    expect(await within(tabs()).findByRole('link', { name: /^جاری/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('a key the summary lists but the code does not know is a tab, and is sent', async () => {
    const groups = summary().orders.groups
    summaryAnswer = () =>
      ok(
        summary({
          orders: {
            ...summary().orders,
            groups: [...groups, { key: 'on_hold' as never, label: 'معلق', statuses: [], count: 2 }],
          },
        }),
      )
    mocks.search = 'group=on_hold'
    renderOrders()
    await waitFor(() => expect(reads()).toEqual([{ status_group: 'on_hold' }]))
    expect(within(tabs()).getByRole('link', { name: /^معلق/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('a key nobody knows (a status name, an old link): every order, never sent', async () => {
    mocks.search = 'group=sent'
    renderOrders()
    await screen.findAllByRole('article')
    expect(reads()).toEqual([{}])
    expect(within(tabs()).getByRole('link', { name: /^همه/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('the sort and the pages', () => {
  it('a sort is the URL’s (replaced) and the API’s; an unknown one is the default', async () => {
    const user = userEvent.setup()
    mocks.search = 'sort=price'
    renderOrders()
    await screen.findAllByRole('article')
    expect(reads()).toEqual([{}])
    await user.selectOptions(screen.getByRole('combobox', { name: 'مرتب‌سازی' }), 'total-desc')
    expect(history.replaced()).toContain('/account/orders/?sort=total-desc')
  })

  it('without script the search is a GET of this page that keeps the tab and the sort', async () => {
    mocks.search = 'group=delivered&sort=total-asc&page=3'
    renderOrders()
    // Named apart from the header's search (two search landmarks on the page).
    const form = screen.getByRole('search', { name: 'جستجو در سفارش\u{200C}ها' })
    expect(form).toHaveAttribute('action', '/account/orders/')
    const kept = [...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')]
    expect(kept.map((input) => [input.name, input.value])).toEqual([
      ['group', 'delivered'],
      ['sort', 'total-asc'],
    ])
  })

  it('the search goes into the URL (a new entry) and back to page 1', async () => {
    const user = userEvent.setup()
    mocks.search = 'page=2'
    renderOrders()
    await user.type(screen.getByRole('searchbox', { name: /جستجو در سفارش‌ها/ }), 'گوشی')
    await user.click(screen.getByRole('button', { name: 'جستجو' }))
    expect(history.pushed()).toContain(`/account/orders/?search=${encodeURIComponent('گوشی')}`)
  })
})

describe('the cards', () => {
  it('each order an article named by its code, with its status, date, total and shipping', async () => {
    renderOrders()
    const card = await screen.findByRole('article', { name: /سفارش ۳۰۶۷۵۶۲۳۵۸/ })
    expect(within(card).getByRole('link', { name: /سفارش ۳۰۶۷۵۶۲۳۵۸/ })).toHaveAttribute(
      'href',
      '/account/orders/3067562358/',
    )
    expect(card).toHaveTextContent('در انتظار پرداخت')
    expect(card).toHaveTextContent('۲۲ شهریور ۱۴۰۵')
    expect(card).toHaveTextContent('۵۳٬۷۹۰٬۰۰۰ تومان')
    expect(card).toHaveTextContent('تهران، تهران، خیابان مطهری')
    expect(within(card).getByRole('button', { name: 'پرداخت' })).toBeVisible()
    expect(within(card).getByRole('button', { name: 'لغو سفارش' })).toBeVisible()
  })

  it('three pictures at most, no «+n» tile (the preview has no quantities); the units in words', async () => {
    const orders = ORDERS()
    const first = orders.results[0]!
    const line = first.item_preview[0]!
    orders.results[0] = { ...first, item_count: 9, item_preview: [line, line, line] }
    listAnswer = () => ok(orders)
    renderOrders()
    const card = await screen.findByRole('article', { name: /سفارش ۳۰۶۷۵۶۲۳۵۸/ })
    expect(card).toHaveTextContent('۹ کالا')
    expect(card).not.toHaveTextContent('+')
  })

  it('a delivered order: its details as the action, and its postal tracking code', async () => {
    renderOrders()
    const card = await screen.findByRole('article', { name: /سفارش ۷۰۱۰۸۶۸۵۷۳/ })
    expect(within(card).getByRole('link', { name: /جزئیات سفارش/ })).toHaveAttribute(
      'href',
      '/account/orders/7010868573/',
    )
    expect(card).toHaveTextContent('۲۵۸۲۶۴۱۴۸۰۶۱۶۸۲۶۱۵۷۸۳۷۰')
    expect(within(card).queryByRole('button', { name: 'پرداخت' })).toBeNull()
  })
})

describe('empty and unreadable', () => {
  it('a group without orders says so, with every order as the way out', async () => {
    mocks.search = 'group=returned'
    listAnswer = () => ok(page([]))
    renderOrders()
    expect(await screen.findByRole('heading', { name: /سفارشی در «مرجوعی» ندارید/ })).toBeVisible()
    expect(screen.getByRole('link', { name: 'همه\u{0654} سفارش‌ها' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
  })

  it('no order at all: «هنوز سفارشی ثبت نکرده‌اید» and the way to the shop', async () => {
    listAnswer = () => ok(page([]))
    renderOrders()
    expect(await screen.findByRole('heading', { name: 'هنوز سفارشی ثبت نکرده‌اید' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'شروع خرید' })).toHaveAttribute('href', '/')
  })

  it('the list cannot be read: «تلاش دوباره» in its place', async () => {
    listAnswer = () => refuse(500, 'server_error', 'خطا')
    renderOrders()
    expect(await screen.findByText('سفارش‌ها بارگذاری نشد.', {}, { timeout: 5000 })).toBeVisible()
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeVisible()
  })
})
