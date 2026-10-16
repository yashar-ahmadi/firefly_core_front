'use client'

import { useId, type Ref } from 'react'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { formatNumber } from '@/lib/format'
import { useT } from '@/lib/i18n/i18n-context'
import { SEARCH_INPUT_PROPS } from './search-form'
import { searchInputClasses, type SearchFieldSize } from './search-field'
import type { SearchBox } from './use-search-box'

// What the desktop suggest box and the phone overlay share around their field: the combobox
// input with its ARIA wiring, the removal hint and the live count of suggestions.

/** Read as the field's description while the recent searches are listed. */
export const REMOVE_HINT = 'برای حذف جستجوی انتخاب\u{200C}شده، Delete یا Backspace را بزنید.'

/** The element id of option `index` of the listbox `listboxId` (`aria-activedescendant`). */
export function optionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`
}

/**
 * The search field as an ARIA 1.2 combobox (list autocomplete) driven by `box`. While the
 * recent searches are listed, it is described by REMOVE_HINT: the keyboard's way to remove the
 * highlighted one is not otherwise visible.
 */
export function ComboboxField({
  box,
  listboxId,
  size,
  inputRef,
  onFocus,
}: {
  box: SearchBox
  listboxId: string
  size: SearchFieldSize
  inputRef?: Ref<HTMLInputElement>
  onFocus?: () => void
}) {
  const t = useT()
  const inputId = useId()
  const hintId = useId()
  return (
    <>
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
        aria-activedescendant={
          box.activeIndex === -1 ? undefined : optionId(listboxId, box.activeIndex)
        }
        aria-describedby={box.recentShown ? hintId : undefined}
        value={box.value}
        onChange={(event) => box.setValue(event.target.value)}
        onFocus={onFocus}
        onKeyDown={box.onKeyDown}
        placeholder={t('search_placeholder')}
        className={searchInputClasses(size)}
      />
      {/* Hidden from reading in place; still read as the field's description. */}
      <span id={hintId} hidden>
        {REMOVE_HINT}
      </span>
    </>
  )
}

/** «N پیشنهاد», announced when the suggestions for a term arrive. */
export function SuggestionStatus({ box }: { box: SearchBox }) {
  return (
    <VisuallyHidden role="status">
      {box.expanded && !box.loading && box.suggestionCount > 0
        ? `${formatNumber(box.suggestionCount)} پیشنهاد`
        : ''}
    </VisuallyHidden>
  )
}
