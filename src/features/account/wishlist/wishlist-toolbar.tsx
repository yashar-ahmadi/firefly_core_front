'use client'

import { useId } from 'react'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { formatNumber } from '@/lib/format'
import { isWishlistSort, WISHLIST_SORTS, type WishlistParams } from './wishlist-params'

export interface WishlistToolbarProps {
  params: WishlistParams
  /** The list's `count`, once it is read. */
  count: number | undefined
  /** Shows these filters (a new sort or the switch goes back to page 1). */
  onChange: (params: WishlistParams) => void
}

/**
 * Over the wishlist's grid: how many products it holds (read out as it changes), «فقط کالاهای
 * موجود» (`in_stock=true`) and the sort by when they were saved (a native select: best on phones
 * and with assistive tech).
 */
export function WishlistToolbar({ params, count, onChange }: WishlistToolbarProps) {
  const sortId = useId()
  return (
    // Phones: the count and the sort on one line, the switch across the next. From sm: one row.
    <div className="mb-4 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-card bg-white px-4 py-2 shadow-card sm:flex sm:flex-wrap sm:gap-x-6 md:mb-5">
      {/* A status: the count of a new sort or filter is read out once it is in. */}
      <p role="status" className="min-h-6 text-base text-ink-700">
        {count !== undefined && `${formatNumber(count)} کالا`}
      </p>
      <div className="flex items-center gap-2 sm:order-last">
        <label
          htmlFor={sortId}
          className="sr-only text-base whitespace-nowrap text-ink-700 sm:not-sr-only"
        >
          مرتب‌سازی
        </label>
        <Select
          id={sortId}
          value={params.sort}
          wrapperClassName="w-36 sm:w-40"
          onChange={(event) => {
            const sort = event.currentTarget.value
            if (isWishlistSort(sort)) onChange({ ...params, sort, page: 1 })
          }}
        >
          {WISHLIST_SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </Select>
      </div>
      <Switch
        label="فقط کالاهای موجود"
        checked={params.inStock}
        onCheckedChange={(checked) => onChange({ ...params, inStock: checked, page: 1 })}
        className="col-span-2 sm:ms-auto"
      />
    </div>
  )
}
