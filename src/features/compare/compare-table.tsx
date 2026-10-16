'use client'

import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import { Switch } from '@/components/ui/switch'
import type { ProductDetail } from '@/lib/api/types/catalog'
import { CompareColumnFailed, CompareColumnHead } from './compare-column-head'
import type { CompareItem } from './compare-item'
import { buildCompareRows, differingRows } from './compare-rows'

const CAPTION = 'مقایسه کالاها'
const ONLY_DIFFERENCES = 'فقط تفاوت\u{200C}ها'
const NO_DIFFERENCES = 'مشخصات این کالاها تفاوتی با هم ندارد.'
const NO_SPECS = 'مشخصاتی برای این کالاها ثبت نشده است.'

/** The first column: the attribute names, held at the start edge while the table scrolls. */
const LABEL_CELL = 'sticky start-0 z-[1] w-28 min-w-28 border-e border-ink-100 bg-white md:w-44'
/**
 * A product's column: on a phone a set 10rem, so one and a part of the next fit beside the names
 * and every column is as wide (the table is `w-max`: without a width, a long value or name on
 * one line would size its column). From md no set width: the product columns, not the names,
 * share the room a wide screen leaves.
 */
const PRODUCT_CELL = 'w-40 min-w-40 md:w-auto md:min-w-56'

/**
 * A column of the table: a product's payload, or one that could not be read (with a retry).
 * `slug` is the entry's slug in the compare list: the column's key and what «حذف از مقایسه»
 * removes. The payload's own slug may be spelled differently (an older or encoded slug that the
 * API answers with the current product), and two entries may even read the same product.
 */
export type CompareColumn =
  | { kind: 'product'; slug: string; product: ProductDetail }
  | { kind: 'failed'; item: CompareItem; onRetry: () => void; retrying: boolean }

const slugOf = (column: CompareColumn) =>
  column.kind === 'product' ? column.slug : column.item.slug

/** Each column's place among the loaded products (the rows' values), or null for a failed one. */
function valueIndexes(columns: readonly CompareColumn[]): (number | null)[] {
  let next = 0
  return columns.map((column) => (column.kind === 'product' ? next++ : null))
}

export interface CompareTableProps {
  /** In the compare list's order (the order they were added). */
  columns: CompareColumn[]
  onRemove: (slug: string) => void
}

/**
 * The comparison: a table with one column per product and one row per attribute any of the
 * loaded ones has (`buildCompareRows`), «—» where a product lacks it. A product that could not be
 * read keeps its column, with a retry, and «نامشخص» cells. The row of column heads (picture,
 * name, price, add or choose, remove) and the column of names stay put while the table scrolls
 * in its own box: both ways on phones, where it is wider than the screen; down when there are
 * more rows than fit. «فقط تفاوت‌ها» hides the rows where every loaded product says the same; it
 * needs two of them, and with fewer every row shows whatever the switch said.
 */
export function CompareTable({ columns, onRemove }: CompareTableProps) {
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const products = columns.flatMap((column) => (column.kind === 'product' ? [column.product] : []))
  const comparable = products.length > 1
  const all = buildCompareRows(products)
  const rows = onlyDifferences && comparable ? differingRows(all) : all
  const empty =
    products.length === 0
      ? null
      : all.length === 0
        ? NO_SPECS
        : rows.length === 0
          ? NO_DIFFERENCES
          : null
  const valueIndex = valueIndexes(columns)

  return (
    <div className="flex flex-col gap-3">
      {comparable && all.length > 0 && (
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
              {columns.map((column) => (
                <th
                  key={slugOf(column)}
                  scope="col"
                  className={cn(
                    PRODUCT_CELL,
                    'sticky top-0 z-[2] border-b border-ink-200 bg-white p-3 align-top font-normal',
                  )}
                >
                  {column.kind === 'product' ? (
                    <CompareColumnHead
                      product={column.product}
                      onRemove={() => onRemove(column.slug)}
                    />
                  ) : (
                    <CompareColumnFailed
                      item={column.item}
                      onRetry={column.onRetry}
                      retrying={column.retrying}
                      onRemove={() => onRemove(column.item.slug)}
                    />
                  )}
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
                {columns.map((column, index) => {
                  const at = valueIndex[index]
                  return (
                    <td
                      key={slugOf(column)}
                      className="p-3 text-start align-top break-words text-ink-900"
                    >
                      {at === null || at === undefined ? (
                        <span className="text-ink-500">نامشخص</span>
                      ) : (
                        row.values[at]
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {empty && <p className="px-4 py-6 text-center text-ink-600">{empty}</p>}
      </div>
    </div>
  )
}
