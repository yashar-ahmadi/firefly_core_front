'use client'

import { Search, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatNumber } from '@/lib/format'
import {
  DEFAULT_READING_LIST_SORT,
  isReadingListSort,
  READING_LIST_SORTS,
  SEARCH_MAX,
  type CategoryOption,
  type ReadingListParams,
} from './reading-list-params'

export interface ReadingListToolbarProps {
  path: string
  params: ReadingListParams
  categories: readonly CategoryOption[]
  /** The list's `count`, once it is read. */
  count: number | undefined
  /** A category or a sort (replaces the URL, back to page 1). */
  onFilter: (params: ReadingListParams) => void
  /** A search sent or cleared (a new history entry, back to page 1). */
  onSearch: (params: ReadingListParams) => void
}

/**
 * Over the reading list's cards: the search (sent as a new history entry; without script a plain
 * GET of this page, the other filters kept), how many posts the view holds (read out as it
 * changes), the blog category and the sort by when they were saved (native selects: best on
 * phones and with assistive tech; a change replaces the URL).
 */
export function ReadingListToolbar({
  path,
  params,
  categories,
  count,
  onFilter,
  onSearch,
}: ReadingListToolbarProps) {
  const sortId = useId()
  const categoryId = useId()
  const [text, setText] = useState(params.search)
  // The URL changed (Back, a cleared filter): the box follows it.
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
        {params.category && <input type="hidden" name="category" value={params.category} />}
        {params.sort !== DEFAULT_READING_LIST_SORT && (
          <input type="hidden" name="sort" value={params.sort} />
        )}
        <Input
          type="search"
          name="search"
          aria-label="جستجو در لیست مطالعه"
          placeholder={'عنوان یا واژه\u{200C}ای از مطلب'}
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
          {count !== undefined && `${formatNumber(count)} مطلب`}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
          <div className="flex items-center gap-2">
            <label htmlFor={categoryId} className="text-base whitespace-nowrap text-ink-700">
              {'دسته\u{200C}بندی'}
            </label>
            <Select
              id={categoryId}
              value={params.category ?? ''}
              wrapperClassName="w-44"
              onChange={(event) => {
                const value = event.currentTarget.value
                onFilter({ ...params, category: value || null, page: 1 })
              }}
            >
              <option value="">همه</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={sortId} className="text-base whitespace-nowrap text-ink-700">
              {'مرتب\u{200C}سازی'}
            </label>
            <Select
              id={sortId}
              value={params.sort}
              wrapperClassName="w-36"
              onChange={(event) => {
                const sort = event.currentTarget.value
                if (isReadingListSort(sort)) onFilter({ ...params, sort, page: 1 })
              }}
            >
              {READING_LIST_SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
