'use client'

import { useEffect, useId, useRef } from 'react'
import { cn } from '@/components/ui/cn'
import { ComboboxField, optionId, SuggestionStatus } from './combobox-field'
import { SearchForm, SearchSubmit } from './search-form'
import type { SearchFieldSize } from './search-field'
import { SuggestList } from './suggest-list'
import { useSearchBox } from './use-search-box'

/** The floating list under the field: over the page, never pushing it down. */
const PANEL = cn(
  'absolute inset-x-0 top-full z-50 mt-2 max-h-[min(36rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain',
  'rounded-card border border-ink-200 bg-white py-2 shadow-raised',
)

export interface SuggestBoxProps {
  size?: SearchFieldSize
  className?: string
  /** Names the form's `search` landmark when the page has another (the header's). */
  label?: string
  /** What the field starts with, e.g. the term the results page could not search. */
  initialValue?: string
}

/**
 * The desktop search field with suggestions (an ARIA 1.2 combobox, see useSearchBox): the
 * recent searches when the empty field is focused; for a term of two characters or more,
 * «جستجوی «…» در همهٔ محصولات», then products (thumbnail and name), categories and brands
 * with the typed term marked. The list floats over the page, so the header never shifts.
 * Without JS (or before hydration) it is the plain GET form to `/search/`.
 */
export function SuggestBox({ size = 'lg', className, label, initialValue }: SuggestBoxProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const box = useSearchBox({ initialValue })
  const activeId = box.activeIndex === -1 ? undefined : optionId(listboxId, box.activeIndex)

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
      <SearchForm onSearch={box.submitted} label={label}>
        <ComboboxField
          box={box}
          listboxId={listboxId}
          size={size}
          inputRef={inputRef}
          onFocus={box.open}
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
          optionId={(index) => optionId(listboxId, index)}
          onChoose={box.choose}
          onFollow={box.follow}
          onRemove={box.removeRecent}
          onClear={() => {
            box.clearRecent()
            inputRef.current?.focus()
          }}
        />
      </div>
      <SuggestionStatus box={box} />
    </div>
  )
}
