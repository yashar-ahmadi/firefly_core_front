'use client'

import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import { Switch } from '@/components/ui/switch'
import type { ProductDetail } from '@/lib/api/types/catalog'
import { CompareColumnHead } from './compare-column-head'
import { buildCompareRows, differingRows } from './compare-rows'

const CAPTION = 'مقایسه کالاها'
const ONLY_DIFFERENCES = 'فقط تفاوت\u{200C}ها'
const NO_DIFFERENCES = 'مشخصات این کالاها تفاوتی با هم ندارد.'
const NO_SPECS = 'مشخصاتی برای این کالاها ثبت نشده است.'

/** The first column: the attribute names, held at the start edge while the table scrolls. */
const LABEL_CELL = 'sticky start-0 z-[1] w-28 min-w-28 border-e border-ink-100 bg-white md:w-44'
/**
 * A product's column: about one and a half fit beside the names on a phone. No set width: the
 * product columns, not the names, share the room a wide screen leaves.
 */
const PRODUCT_CELL = 'min-w-40 md:min-w-56'

export interface CompareTableProps {
  /** In the compare list's order (the order they were added). */
  products: ProductDetail[]
  onRemove: (slug: string) => void
}

/**
 * The comparison: a table with one column per product and one row per attribute any of them
 * has (`buildCompareRows`), «—» where a product lacks it. The row of column heads (picture,
 * name, price, add or choose, remove) and the column of names stay put while the table scrolls
 * in its own box: both ways on phones, where it is wider than the screen; down when there are
 * more rows than fit. «فقط تفاوت‌ها» hides the rows where every product says the same.
 */
export function CompareTable({ products, onRemove }: CompareTableProps) {
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const all = buildCompareRows(products)
  const rows = onlyDifferences ? differingRows(all) : all
  const empty = all.length === 0 ? NO_SPECS : rows.length === 0 ? NO_DIFFERENCES : null

  return (
    <div className="flex flex-col gap-3">
      {products.length > 1 && all.length > 0 && (
        <Switch
          label={ONLY_DIFFERENCES}
          checked={onlyDifferences}
          onCheckedChange={setOnlyDifferences}
          className="self-start rounded-card bg-white px-4 shadow-card sm:min-w-72"
        />
      )}
      <div
        className={cn(
          'overflow-auto overscroll-x-contain rounded-card bg-white shadow-card',
          // Room for the sticky header above and, on phones, the bottom bar below.
          'max-h-[calc(100dvh-var(--header-full)-6rem-env(safe-area-inset-bottom))] md:max-h-[calc(100dvh-var(--header-full)-2rem)]',
        )}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-base">
          <caption className="sr-only">{CAPTION}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(LABEL_CELL, 'top-0 z-[3] border-b p-3 align-bottom')}>
                <span className="sr-only">ویژگی</span>
              </th>
              {products.map((product) => (
                <th
                  key={product.slug}
                  scope="col"
                  className={cn(
                    PRODUCT_CELL,
                    'sticky top-0 z-[2] border-b border-ink-200 bg-white p-3 align-top font-normal',
                  )}
                >
                  <CompareColumnHead product={product} onRemove={() => onRemove(product.slug)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="[&>*]:border-b [&>*]:border-ink-100 last:[&>*]:border-b-0"
              >
                <th
                  scope="row"
                  className={cn(LABEL_CELL, 'p-3 text-start align-top font-medium text-ink-600')}
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={products[index]?.slug ?? index}
                    className="p-3 text-start align-top break-words text-ink-900"
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {empty && <p className="px-4 py-6 text-center text-ink-600">{empty}</p>}
      </div>
    </div>
  )
}
