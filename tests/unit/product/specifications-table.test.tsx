import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SpecificationsTable, specRows } from '@/features/product/components/specifications-table'
import type { ProductSpecification } from '@/lib/api/types/catalog'
import { s25Product } from './fixtures'

// The full specification table (product digest §5.7): values joined with «، », else the free
// text, and a row with neither left out.

function row(id: number, changes: Partial<ProductSpecification>): ProductSpecification {
  return {
    id,
    attribute_id: id,
    attribute_name: `ویژگی ${id}`,
    values: [],
    custom_attribute_value: null,
    show_in_product_description: false,
    display_priority: id,
    ...changes,
  }
}

describe('specRows', () => {
  it('joins the values with «، », else takes the free text, in the payload order', () => {
    expect(specRows(s25Product().specifications)).toEqual([
      { id: 10001, name: 'رنگ', text: 'مشکی، نقره ای، طلایی' },
      { id: 10002, name: 'حافظه داخلی', text: '۲۵۶ گیگابایت، ۵۱۲ گیگابایت، ۱ ترابایت' },
      { id: 10003, name: 'حافظه رم', text: '۱۲ گیگابایت' },
      { id: 10004, name: 'جنس', text: 'نمایشگر ۶.۸ اینچی QHD+ با نرخ نوسازی ۱۲۰ هرتز' },
    ])
  })

  it('skips fully empty rows: no values and no (or a blank) free text', () => {
    const rows = specRows([
      row(1, { values: [] }),
      row(2, { custom_attribute_value: '   ' }),
      row(3, { values: ['فولاد'] }),
      row(4, { values: ['', ' '] }),
    ])
    expect(rows).toEqual([{ id: 3, name: 'ویژگی 3', text: 'فولاد' }])
  })
})

describe('SpecificationsTable', () => {
  it('is a description list of name and value', () => {
    render(<SpecificationsTable specifications={s25Product().specifications} />)
    const names = screen.getAllByRole('term').map((term) => term.textContent)
    const values = screen.getAllByRole('definition').map((value) => value.textContent)
    expect(names).toEqual(['رنگ', 'حافظه داخلی', 'حافظه رم', 'جنس'])
    expect(values[0]).toBe('مشکی، نقره ای، طلایی')
    expect(values[3]).toBe('نمایشگر ۶.۸ اینچی QHD+ با نرخ نوسازی ۱۲۰ هرتز')
  })

  it('leaves out an empty row and renders nothing when every row is empty', () => {
    const { container, rerender } = render(
      <SpecificationsTable specifications={[row(1, {}), row(2, { values: ['آبی'] })]} />,
    )
    const list = container.querySelector('dl')!
    expect(within(list).getAllByRole('term')).toHaveLength(1)
    expect(within(list).queryByText('ویژگی 1')).toBeNull()
    rerender(<SpecificationsTable specifications={[row(1, {})]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
