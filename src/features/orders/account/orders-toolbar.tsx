'use client'

import { Search, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatNumber } from '@/lib/format'
import {
  DEFAULT_ORDER_SORT,
  isOrderSort,
  ORDER_SORTS,
  SEARCH_MAX,
  type OrdersParams,
} from './orders-params'

// Over «سفارش‌های من»'s cards: how many orders the view holds (read out as it changes), the sort
// (a native select: best on phones and with assistive tech; a change replaces the URL) and the
// search (an order code's start, a postal tracking code, or words of a product's name; sent as a
// new history entry, back to page 1). Without script the search is a plain GET of this page
// (the tab and the sort kept).

export interface OrdersToolbarProps {
  path: string
  params: OrdersParams
  count: number | undefined
  /** A sort (replaces the URL). */
  onSort: (params: OrdersParams) => void
  /** A search sent or cleared (a new history entry). */
  onSearch: (params: OrdersParams) => void
}

export function OrdersToolbar({ path, params, count, onSort, onSearch }: OrdersToolbarProps) {
  const sortId = useId()
  const [text, setText] = useState(params.search)
  // The URL changed (Back, a tab): the box follows it.
  const [seen, setSeen] = useState(params.search)
  if (seen !== params.search) {
    setSeen(params.search)
    setText(params.search)
  }
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-card bg-white p-4 shadow-card md:mb-5">
      <form
        role="search"
        method="get"
        action={path}
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSearch({ ...params, search: text.trim().slice(0, SEARCH_MAX), page: 1 })
        }}
      >
        {params.group && <input type="hidden" name="group" value={params.group} />}
        {params.sort !== DEFAULT_ORDER_SORT && (
          <input type="hidden" name="sort" value={params.sort} />
        )}
        <Input
          type="search"
          name="search"
          aria-label="جستجو در سفارش‌ها"
          placeholder="کد سفارش، کد رهگیری یا نام کالا"
          maxLength={SEARCH_MAX}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          startAdornment={<Search aria-hidden />}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline">
          جستجو
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p role="status" className="min-h-6 text-base text-ink-700">
          {count !== undefined && `${formatNumber(count)} سفارش`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {params.search && (
            <Button
              variant="ghost"
              size="sm"
              iconStart={<X aria-hidden />}
              onClick={() => onSearch({ ...params, search: '', page: 1 })}
            >
              پاک کردن جستجو
            </Button>
          )}
          <label htmlFor={sortId} className="text-base whitespace-nowrap text-ink-700">
            مرتب‌سازی
          </label>
          <Select
            id={sortId}
            value={params.sort}
            wrapperClassName="w-40"
            onChange={(event) => {
              const sort = event.currentTarget.value
              if (isOrderSort(sort)) onSort({ ...params, sort, page: 1 })
            }}
          >
            {ORDER_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  )
}
