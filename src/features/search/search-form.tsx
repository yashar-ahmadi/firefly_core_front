'use client'

import { Search } from 'lucide-react'
import Form from 'next/form'
import { useId, type MouseEvent, type ReactNode, type Ref } from 'react'
import { cn } from '@/components/ui/cn'
import { useT } from '@/lib/i18n/i18n-context'
import { MAX_QUERY_LENGTH, normalizeQuery } from './query'
import { useRecentSearches } from './recent-searches'
import { SEARCH_SUBMIT, searchInputClasses, type SearchFieldSize } from './search-field'

/**
 * The search form: a GET to `/search/?q=…`, through next/form (client-side navigation, a plain
 * form without JS). A term that is empty once normalised is not sent; any other is remembered
 * among the recent searches, then `onSearch` runs.
 *
 * next/form prefetches `/search/` (no `q`) when the form shows. That is harmless and kept: the
 * results page never calls the search API without a term, so a prefetch logs no search.
 */
export function SearchForm({
  className,
  formRef,
  label,
  onSearch,
  children,
}: {
  className?: string
  formRef?: Ref<HTMLFormElement>
  /** Names the `search` landmark: needed when a page has more than one. */
  label?: string
  onSearch?: () => void
  children: ReactNode
}) {
  const add = useRecentSearches((state) => state.add)
  return (
    <Form
      ref={formRef}
      action="/search/"
      role="search"
      aria-label={label}
      className={cn('relative flex w-full items-center', className)}
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem('q')
        if (!(input instanceof HTMLInputElement)) return
        if (normalizeQuery(input.value) === '') {
          event.preventDefault()
          input.focus()
          return
        }
        add(input.value)
        onSearch?.()
      }}
    >
      {children}
    </Form>
  )
}

/** The magnifier that submits the form (`onClick` may take it over: the phone overlay). */
export function SearchSubmit({
  onClick,
}: {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const t = useT()
  return (
    <button type="submit" aria-label={t('search')} onClick={onClick} className={SEARCH_SUBMIT}>
      <Search aria-hidden className="size-5" />
    </button>
  )
}

/** What every search input shares: the name the form sends, the API's length limit, no autofill. */
export const SEARCH_INPUT_PROPS = {
  name: 'q',
  type: 'search',
  enterKeyHint: 'search',
  autoComplete: 'off',
  maxLength: MAX_QUERY_LENGTH,
} as const

/**
 * The search form with a plain input: the phone header's field before the overlay takes over,
 * and the stand-in for a suggest box that failed to render.
 */
export function PlainSearchForm({
  size = 'lg',
  className,
  label,
  initialValue,
}: {
  size?: SearchFieldSize
  className?: string
  label?: string
  initialValue?: string
}) {
  const t = useT()
  const id = useId()
  return (
    <SearchForm className={className} label={label}>
      <label htmlFor={id} className="sr-only">
        {t('search')}
      </label>
      <input
        id={id}
        {...SEARCH_INPUT_PROPS}
        defaultValue={initialValue}
        placeholder={t('search_placeholder')}
        className={searchInputClasses(size)}
      />
      <SearchSubmit />
    </SearchForm>
  )
}
