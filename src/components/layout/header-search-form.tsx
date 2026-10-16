'use client'

import { Search } from 'lucide-react'
import Form from 'next/form'
import { useId } from 'react'
import { cn } from '@/components/ui/cn'
import { useT } from '@/lib/i18n/i18n-context'

/**
 * The header's search box: a plain GET form to `/search/?q=…` (client-side navigation through
 * next/form). An empty query is not sent. Plan 2 adds suggestions and the phone search overlay.
 */
export function HeaderSearchForm({
  size = 'lg',
  className,
}: {
  /** `lg` is 48px (desktop and tablet), `md` 44px (phones). */
  size?: 'md' | 'lg'
  className?: string
}) {
  const t = useT()
  const id = useId()
  return (
    <Form
      action="/search/"
      role="search"
      className={cn('relative flex items-center', className)}
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem('q')
        if (input instanceof HTMLInputElement && input.value.trim() === '') {
          event.preventDefault()
          input.focus()
        }
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t('search')}
      </label>
      <input
        id={id}
        name="q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={t('search_placeholder')}
        className={cn(
          'w-full rounded-control border border-transparent bg-ink-100 ps-12 pe-4 text-base text-ink-900 placeholder:text-ink-500',
          'transition-[background-color,border-color,box-shadow] duration-150 hover:bg-ink-200/70',
          'focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 focus:outline-none',
          '[&::-webkit-search-cancel-button]:appearance-none',
          size === 'lg' ? 'h-12' : 'h-11',
        )}
      />
      <button
        type="submit"
        aria-label={t('search')}
        className="absolute start-1 grid size-10 cursor-pointer place-items-center rounded-control text-ink-500 transition-colors hover:text-brand-700"
      >
        <Search aria-hidden className="size-5" />
      </button>
    </Form>
  )
}
