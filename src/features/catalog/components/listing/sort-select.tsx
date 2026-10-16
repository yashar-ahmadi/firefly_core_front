'use client'

import { ArrowDownWideNarrow } from 'lucide-react'
import { useId } from 'react'
import { Select } from '@/components/ui/select'
import { isSortValue, type SortOption, type SortValue } from '@/lib/api/types/catalog'
import { useListingUrl } from './use-listing-url'

export interface SortSelectProps {
  /** `filters.sort_options`: the API's own Persian labels. */
  options: SortOption[]
  /** Chosen when the URL has no `sort`; choosing it removes `sort` from the URL. */
  defaultSort: SortValue
}

/** The sort dropdown: a native select (best on phones and with assistive tech). */
export function SortSelect({ options, defaultSort }: SortSelectProps) {
  const { query, set } = useListingUrl()
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="sr-only lg:not-sr-only lg:text-base lg:whitespace-nowrap lg:text-ink-700"
      >
        مرتب‌سازی
      </label>
      <div className="relative w-full lg:w-52">
        <ArrowDownWideNarrow
          aria-hidden
          className="pointer-events-none absolute start-3.5 top-1/2 z-[1] size-5 -translate-y-1/2 text-ink-600"
        />
        <Select
          id={id}
          value={query.sort ?? defaultSort}
          onChange={(event) => {
            const sort = event.target.value
            if (isSortValue(sort)) set({ sort: sort === defaultSort ? undefined : sort })
          }}
          className="ps-11"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
