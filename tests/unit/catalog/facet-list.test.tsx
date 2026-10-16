import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FacetList, type Facet } from '@/features/catalog/components/listing/facet-list'
import type { FilterAttribute } from '@/lib/api/types/catalog'
import { LIST_CATEGORIES, MOBILE_FILTERS, STORE_BRANDS } from './filter-fixtures'

function renderFacet(facet: Facet, selected: string[] = [], legend = 'گروه') {
  const onChange = vi.fn()
  render(<FacetList facet={facet} legend={legend} selected={selected} onChange={onChange} />)
  return { onChange, user: userEvent.setup() }
}

const [STORAGE, , COLOR] = MOBILE_FILTERS.attributes as [
  FilterAttribute,
  FilterAttribute,
  FilterAttribute,
]

describe('FacetList: categories', () => {
  it('hides options with product_count 0 and offers «all» first, in a named group', () => {
    renderFacet({ kind: 'category', options: LIST_CATEGORIES }, [], 'دسته‌بندی')
    const group = screen.getByRole('radiogroup', { name: 'دسته‌بندی' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    expect(within(group).queryByRole('radio', { name: /تبلت/ })).toBeNull()
    expect(within(group).getByRole('radio', { name: /گوشی موبایل/ })).toBeInTheDocument()
    expect(within(group).getAllByRole('radio')[0]).toHaveAccessibleName(/همه/)
  })

  it('chooses one category, or none with «all»', async () => {
    const { onChange, user } = renderFacet({ kind: 'category', options: LIST_CATEGORIES }, [
      'laptop',
    ])
    expect(screen.getByRole('radio', { name: /لپ تاپ/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /گوشی موبایل/ }))
    expect(onChange).toHaveBeenLastCalledWith(['mobile-phone'])
    await user.click(screen.getAllByRole('radio')[0]!)
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('names each option with its product count in Persian digits', () => {
    renderFacet({ kind: 'category', options: LIST_CATEGORIES })
    expect(screen.getByRole('radio', { name: /گوشی موبایل.*۶ کالا/ })).toBeInTheDocument()
  })
})

describe('FacetList: attributes', () => {
  it('renders colour swatches named by the value, pressed with a check mark when selected', async () => {
    const { onChange, user } = renderFacet(
      { kind: 'attribute', attribute: COLOR },
      ['10005'],
      'رنگ',
    )
    const group = screen.getByRole('group', { name: 'رنگ' })
    const black = within(group).getByRole('button', { name: 'مشکی' })
    const blue = within(group).getByRole('button', { name: 'آبی' })
    expect(black).toHaveAttribute('aria-label', 'مشکی')
    expect(black).toHaveAttribute('aria-pressed', 'false')
    expect(blue).toHaveAttribute('aria-pressed', 'true')
    expect(blue.querySelector('.lucide-check')).not.toBeNull()
    expect(black.querySelector('.lucide-check')).toBeNull()
    await user.click(black)
    expect(onChange).toHaveBeenCalledWith(['10005', '10001'])
    await user.click(blue)
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('renders pattern values as image swatches', () => {
    const pattern: FilterAttribute = {
      id: 7,
      name: 'طرح',
      input_type: 'pattern',
      values: [{ id: 70, name: 'چهارخانه', color: null, pattern: 'https://api.test/media/p.png' }],
    }
    renderFacet({ kind: 'attribute', attribute: pattern }, [], 'طرح')
    const swatch = screen.getByRole('button', { name: 'چهارخانه' })
    expect(swatch.querySelector('img')).toHaveAttribute('src', 'https://api.test/media/p.png')
  })

  it('renders other input types as checkboxes', async () => {
    const { onChange, user } = renderFacet({ kind: 'attribute', attribute: STORAGE }, [], 'حافظه')
    const group = screen.getByRole('group', { name: 'حافظه' })
    await user.click(within(group).getByRole('checkbox', { name: '۲۵۶ گیگابایت' }))
    expect(onChange).toHaveBeenCalledWith(['10015'])
  })
})

describe('FacetList: brands', () => {
  it('lists up to eight brands as checkboxes without a search box', async () => {
    const { onChange, user } = renderFacet({ kind: 'brand', options: MOBILE_FILTERS.brands }, [
      'xiaomi',
    ])
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'شیائومی' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'اپل' }))
    expect(onChange).toHaveBeenCalledWith(['xiaomi', 'apple'])
  })

  it('adds a search box over more than eight brands', async () => {
    const { user } = renderFacet({ kind: 'brand', options: STORE_BRANDS })
    const search = screen.getByRole('searchbox', { name: 'جستجوی برند' })
    expect(screen.getAllByRole('checkbox')).toHaveLength(30)
    await user.type(search, 'سونی')
    expect(screen.getAllByRole('checkbox').map(labelOf)).toEqual(['سونی', 'پاناسونیک'])
  })

  it('matches Arabic ي and ك, spaces, ZWNJ and Latin slugs (Persian-aware)', async () => {
    const { user } = renderFacet({ kind: 'brand', options: STORE_BRANDS })
    const search = screen.getByRole('searchbox', { name: 'جستجوی برند' })
    const visible = () => screen.getAllByRole('checkbox').map(labelOf)

    await user.type(search, 'ش\u{064A}ائوم\u{064A}')
    expect(visible()).toEqual(['شیائومی'])

    await user.clear(search)
    await user.type(search, 'الجی')
    expect(visible()).toEqual(['ال جی'])

    await user.clear(search)
    await user.type(search, 'می\u{200C}بلین')
    expect(visible()).toEqual(['میبلین'])

    await user.clear(search)
    await user.type(search, 'چا\u{064A} احمد')
    expect(visible()).toEqual(['چای احمد'])

    await user.clear(search)
    await user.type(search, 'XIAOMI')
    expect(visible()).toEqual(['شیائومی'])
  })

  it('keeps selected brands in view and says when nothing matches', async () => {
    const { user } = renderFacet({ kind: 'brand', options: STORE_BRANDS }, ['apple'])
    await user.type(screen.getByRole('searchbox', { name: 'جستجوی برند' }), 'zzz')
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: 'اپل' })).toBeChecked()
    expect(screen.getByText('برندی با این نام پیدا نشد')).toBeInTheDocument()
  })
})

/** The visible label of a checkbox. */
function labelOf(box: HTMLElement): string {
  return document.querySelector(`label[for="${box.id}"]`)?.textContent ?? ''
}
