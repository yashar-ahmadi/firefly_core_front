'use client'

import { useEffect, useId, useRef } from 'react'
import { cn } from '@/components/ui/cn'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { formatNumber } from '@/lib/format'
import { useT } from '@/lib/i18n/i18n-context'
import { SEARCH_INPUT_PROPS, SearchForm, SearchSubmit } from './search-form'
import { searchInputClasses, type SearchFieldSize } from './search-field'
import { SuggestList } from './suggest-list'
import { useSearchBox } from './use-search-box'

/** The floating list under the field: over the page, never pushing it down. */
const PANEL = cn(
  'absolute inset-x-0 top-full z-50 mt-2 max-h-[min(36rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain',
  'rounded-card border border-ink-200 bg-white py-2 shadow-raised',
)

/**
 * The desktop search field with suggestions (an ARIA 1.2 combobox, see useSearchBox): the
 * recent searches when the empty field is focused; for a term of two characters or more,
 * «جستجوی «…» در همهٔ محصولات», then products (thumbnail and name), categories and brands
 * with the typed term marked. The list floats over the page, so the header never shifts.
 * Without JS (or before hydration) it is the plain GET form to `/search/`.
 */
export function SuggestBox({
  size = 'lg',
  className,
}: {
  size?: SearchFieldSize
  className?: string
}) {
  const t = useT()
  const inputId = useId()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const box = useSearchBox()
  const optionId = (index: number) => `${listboxId}-option-${index}`
  const activeId = box.activeIndex === -1 ? undefined : optionId(box.activeIndex)

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) box.close()
      }}
    >
      <SearchForm onSearch={box.submitted}>
        <label htmlFor={inputId} className="sr-only">
          {t('search')}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          {...SEARCH_INPUT_PROPS}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={box.expanded}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          value={box.value}
          onChange={(event) => box.setValue(event.target.value)}
          onFocus={box.open}
          onKeyDown={box.onKeyDown}
          placeholder={t('search_placeholder')}
          className={searchInputClasses(size)}
        />
        <SearchSubmit />
      </SearchForm>
      <div
        className={cn(PANEL, !box.expanded && 'hidden')}
        // Pressing in the list keeps the focus (and the caret) in the field.
        onMouseDown={(event) => event.preventDefault()}
      >
        <SuggestList
          id={listboxId}
          options={box.options}
          activeIndex={box.activeIndex}
          query={box.value}
          optionId={optionId}
          onChoose={box.choose}
          onFollow={box.follow}
          onRemove={box.removeRecent}
          onClear={() => {
            box.clearRecent()
            inputRef.current?.focus()
          }}
        />
      </div>
      <VisuallyHidden role="status">
        {box.expanded && !box.loading && box.suggestionCount > 0
          ? `${formatNumber(box.suggestionCount)} پیشنهاد`
          : ''}
      </VisuallyHidden>
    </div>
  )
}
