import { specRows } from '@/features/product/components/specifications-table'
import type { ProductDetail } from '@/lib/api/types/catalog'

// The rows of the compare table (product digest §5.7): one per attribute any of the products
// has, its values formatted as on the product page's specifications table. Pure.

/** The value of a product that lacks the row. */
export const MISSING = '—'

export interface CompareRow {
  /** The attribute's id: rows line up by it across products. */
  id: number
  /** The attribute's name as the first product that has it spells it. */
  label: string
  /** One value per product, in the products' order; {@link MISSING} where a product lacks it. */
  values: string[]
}

/**
 * The union of the products' specification rows by `attribute_id`, in first-seen order (the
 * first product's table order, then each new attribute of the next ones). Values are joined as
 * on the product page («، »); a row empty for a product counts as missing there, and a row
 * empty for every product is left out.
 */
export function buildCompareRows(
  products: readonly Pick<ProductDetail, 'specifications'>[],
): CompareRow[] {
  const rows = new Map<number, CompareRow>()
  products.forEach((product, column) => {
    for (const spec of specRows(product.specifications)) {
      let row = rows.get(spec.attributeId)
      if (!row) {
        row = { id: spec.attributeId, label: spec.name, values: products.map(() => MISSING) }
        rows.set(spec.attributeId, row)
      }
      // A product listing one attribute twice keeps its first row, as its own table shows first.
      if (row.values[column] === MISSING) row.values[column] = spec.text
    }
  })
  return [...rows.values()]
}

/** «فقط تفاوت‌ها»: the rows where the products do not all have the same value. */
export function differingRows(rows: readonly CompareRow[]): CompareRow[] {
  return rows.filter((row) => row.values.some((value) => value !== row.values[0]))
}
