import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCompareRows, differingRows, MISSING } from '@/features/compare/compare-rows'
import { CompareTable, type CompareColumn } from '@/features/compare/compare-table'
import type { CompareItem } from '@/features/compare/store'
import { useQuickViewStore } from '@/features/quick-view/use-quick-view'
import type { ProductDetail, ProductSpecification } from '@/lib/api/types/catalog'
import { chipsProduct, s25Product } from '../product/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))

stubBrowserApis()

function spec(
  attributeId: number,
  name: string,
  values: string[],
  custom: string | null = null,
): ProductSpecification {
  return {
    id: attributeId * 10,
    attribute_id: attributeId,
    attribute_name: name,
    values,
    custom_attribute_value: custom,
    show_in_product_description: false,
    display_priority: 1,
  }
}

/** The S25 Ultra with a short table: colour, storage and a free-text screen row. */
const phone = () =>
  s25Product({
    specifications: [
      spec(10001, 'رنگ', ['مشکی', 'نقره ای']),
      spec(10002, 'حافظه داخلی', ['۲۵۶ گیگابایت']),
      spec(10005, 'صفحه نمایش', [], 'نمایشگر ۶.۸ اینچی'),
    ],
  })

/** A second phone: the same storage, another colour, no screen row, a battery row of its own. */
const other = () =>
  s25Product({
    id: 10002,
    slug: 'apple-iphone-16-pro-max',
    name: 'گوشی موبایل اپل آیفون ۱۶ پرو مکس',
    specifications: [
      spec(10002, 'حافظه داخلی', ['۲۵۶ گیگابایت']),
      spec(10001, 'رنگ', ['طلایی']),
      spec(10009, 'باتری', ['۴۶۸۵ میلی\u{200C}آمپر']),
      spec(10010, 'وزن', [], '   '),
    ],
  })

describe('buildCompareRows', () => {
  it('builds the union of the rows by attribute, in first-seen order, «—» where missing', () => {
    expect(buildCompareRows([phone(), other()])).toEqual([
      { id: 10001, label: 'رنگ', values: ['مشکی، نقره ای', 'طلایی'] },
      { id: 10002, label: 'حافظه داخلی', values: ['۲۵۶ گیگابایت', '۲۵۶ گیگابایت'] },
      { id: 10005, label: 'صفحه نمایش', values: ['نمایشگر ۶.۸ اینچی', MISSING] },
      { id: 10009, label: 'باتری', values: [MISSING, '۴۶۸۵ میلی\u{200C}آمپر'] },
    ])
    expect(MISSING).toBe('—')
  })

  it('leaves out rows that are empty for every product', () => {
    const rows = buildCompareRows([other()])
    expect(rows.map((row) => row.label)).toEqual(['حافظه داخلی', 'رنگ', 'باتری'])
  })

  it('gives no rows for products without specifications', () => {
    expect(buildCompareRows([chipsProduct({ specifications: [] })])).toEqual([])
  })
})

describe('differingRows («فقط تفاوت‌ها»)', () => {
  it('drops the rows whose values are all equal', () => {
    const rows = buildCompareRows([phone(), other()])
    expect(differingRows(rows).map((row) => row.label)).toEqual(['رنگ', 'صفحه نمایش', 'باتری'])
  })
})

/** Every product loaded: one column each, listed under its own slug. */
const loaded = (products: ProductDetail[]): CompareColumn[] =>
  products.map((product) => ({ kind: 'product', slug: product.slug, product }))

function tableUi(columns: CompareColumn[], onRemove: (slug: string) => void) {
  return <CompareTable columns={columns} onRemove={onRemove} />
}

function renderColumns(columns: CompareColumn[], onRemove = vi.fn()) {
  const { wrapper: Base } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => <Base>{children}</Base>
  return { ...render(tableUi(columns, onRemove), { wrapper }), onRemove }
}

const renderTable = (products: ProductDetail[], onRemove = vi.fn()) =>
  renderColumns(loaded(products), onRemove)

beforeEach(() => {
  useQuickViewStore.setState({ request: null, open: false, hosts: 0 })
})

describe('CompareTable', () => {
  it('heads each column with the product: image, name link, price and remove', () => {
    renderTable([phone(), other()])
    const table = screen.getByRole('table', { name: 'مقایسه کالاها' })
    const headers = within(table).getAllByRole('columnheader')
    // The corner cell, then one per product.
    expect(headers).toHaveLength(3)
    expect(
      within(headers[1]!).getByRole('link', { name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا' }),
    ).toHaveAttribute('href', '/product/samsung-galaxy-s25-ultra/')
    expect(within(headers[1]!).getByText('۷۸٬۵۰۰٬۰۰۰')).toBeInTheDocument()
    expect(
      within(headers[2]!).getByRole('button', { name: 'حذف از مقایسه' }),
    ).toHaveAccessibleDescription('گوشی موبایل اپل آیفون ۱۶ پرو مکس')
  })

  it('names each row by its attribute, with one cell per product', () => {
    renderTable([phone(), other()])
    const row = screen.getByRole('row', { name: /^باتری/ })
    expect(within(row).getByRole('rowheader')).toHaveTextContent('باتری')
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([MISSING, '۴۶۸۵ میلی\u{200C}آمپر'])
  })

  it('shows only the differences when asked, and everything again after', async () => {
    const user = userEvent.setup()
    renderTable([phone(), other()])
    expect(screen.getByRole('row', { name: /^حافظه داخلی/ })).toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: 'فقط تفاوت\u{200C}ها' })
    await user.click(toggle)
    expect(screen.queryByRole('row', { name: /^حافظه داخلی/ })).toBeNull()
    expect(screen.getByRole('row', { name: /^رنگ/ })).toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByRole('row', { name: /^حافظه داخلی/ })).toBeInTheDocument()
  })

  it('keys and removes a column by its slug in the compare list, whatever slug the API answers with', async () => {
    const user = userEvent.setup()
    // Two saved entries (an old, encoded spelling and the current one) that read the same product.
    const { onRemove } = renderColumns([
      { kind: 'product', slug: 'samsung-galaxy-s25-ultra', product: phone() },
      { kind: 'product', slug: 'samsung%2Dgalaxy-s25-ultra', product: phone() },
    ])
    const [, , second] = screen.getAllByRole('columnheader')
    await user.click(within(second!).getByRole('button', { name: 'حذف از مقایسه' }))
    expect(onRemove).toHaveBeenCalledWith('samsung%2Dgalaxy-s25-ultra')
  })

  it('says so when the products differ in nothing', async () => {
    const user = userEvent.setup()
    renderTable([phone(), { ...phone(), id: 10009, slug: 'samsung-galaxy-s25-ultra-twin' }])
    await user.click(screen.getByRole('switch', { name: 'فقط تفاوت\u{200C}ها' }))
    expect(screen.getByText('مشخصات این کالاها تفاوتی با هم ندارد.')).toBeInTheDocument()
  })

  it('adds a simple product in one tap and opens quick view for a variable one', async () => {
    const user = userEvent.setup()
    useQuickViewStore.setState({ hosts: 1 })
    renderTable([
      phone(),
      chipsProduct({
        in_stock: true,
        variants: [{ ...chipsProduct().variants[0]!, in_stock: true }],
      }),
    ])
    const [, variable, simple] = screen.getAllByRole('columnheader')
    expect(within(simple!).getByRole('button', { name: /افزودن به سبد/ })).toBeEnabled()
    await user.click(within(variable!).getByRole('button', { name: 'انتخاب ویژگی\u{200C}ها' }))
    // On its representative variant (the payload's default).
    expect(useQuickViewStore.getState().request).toMatchObject({
      slug: 'samsung-galaxy-s25-ultra',
      variantId: null,
    })
  })

  it('hands the slug of a removed product to its parent', async () => {
    const user = userEvent.setup()
    const { onRemove } = renderTable([phone(), other()])
    const [, first] = screen.getAllByRole('columnheader')
    await user.click(within(first!).getByRole('button', { name: 'حذف از مقایسه' }))
    expect(onRemove).toHaveBeenCalledWith('samsung-galaxy-s25-ultra')
  })

  it('compares everything again once fewer than two products are left', async () => {
    const user = userEvent.setup()
    const { rerender } = renderTable([phone(), other()])
    await user.click(screen.getByRole('switch', { name: 'فقط تفاوت\u{200C}ها' }))
    expect(screen.queryByRole('row', { name: /^حافظه داخلی/ })).toBeNull()
    // One product removed: nothing to differ from, every row is back and the switch goes.
    rerender(tableUi(loaded([phone()]), vi.fn()))
    expect(screen.getByRole('row', { name: /^حافظه داخلی/ })).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('keeps a column for a product that failed to load, with a retry, beside the loaded ones', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const failed: CompareItem = {
      slug: 'apple-iphone-15',
      name: 'گوشی موبایل اپل آیفون ۱۵',
      image: 'https://api.shop.ir/media/15.jpg',
      categoryId: 10002,
    }
    const { onRemove } = renderColumns([
      { kind: 'product', slug: 'samsung-galaxy-s25-ultra', product: phone() },
      { kind: 'failed', item: failed, onRetry, retrying: false },
    ])
    const [, ok, broken] = screen.getAllByRole('columnheader')
    expect(within(ok!).getByText('۷۸٬۵۰۰٬۰۰۰')).toBeInTheDocument()
    expect(within(broken!).getByRole('link', { name: failed.name })).toHaveAttribute(
      'href',
      '/product/apple-iphone-15/',
    )
    expect(within(broken!).getByText('اطلاعات این کالا دریافت نشد.')).toBeInTheDocument()
    await user.click(within(broken!).getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await user.click(within(broken!).getByRole('button', { name: 'حذف از مقایسه' }))
    expect(onRemove).toHaveBeenCalledWith('apple-iphone-15')
    // Its cells are unknown, not «—» (which would say the product lacks the attribute).
    const colour = screen.getByRole('row', { name: /^رنگ/ })
    expect(
      within(colour)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['مشکی، نقره ای', 'نامشخص'])
  })
})
