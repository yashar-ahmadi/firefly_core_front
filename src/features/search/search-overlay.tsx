'use client'

import { ArrowRight } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useId, useRef } from 'react'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/icon-button'
import { useReturnFocus } from '@/components/ui/overlay-panel'
import { useT } from '@/lib/i18n/i18n-context'
import { SEARCH_INPUT_PROPS, SearchForm, SearchSubmit } from './search-form'
import { searchInputClasses } from './search-field'
import { SuggestList } from './suggest-list'
import { useSearchBox } from './use-search-box'

export interface SearchOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What the field starts with: whatever was typed on the closed header field. */
  initialValue?: string
}

const HINT = 'نام کالا، برند یا دسته\u{200C}بندی را بنویسید.'

/** The open overlay: mounted on each opening, so it always starts from `initialValue`. */
function OverlayContent({ initialValue, onClose }: { initialValue: string; onClose: () => void }) {
  const t = useT()
  const inputId = useId()
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const box = useSearchBox({ inline: true, initialValue, onDone: onClose })
  const optionId = (index: number) => `${listboxId}-option-${index}`
  const returnFocus = useReturnFocus({
    onOpenAutoFocus(event) {
      event.preventDefault()
      inputRef.current?.focus()
    },
  })

  return (
    <DialogPrimitive.Content
      aria-describedby={undefined}
      {...returnFocus}
      onEscapeKeyDown={(event) => {
        // Escape clears what is typed first; on an empty field it closes.
        if (box.value === '') return
        event.preventDefault()
        box.setValue('')
      }}
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-white outline-none',
        'pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        'motion-safe:data-[state=open]:animate-fade-in',
      )}
    >
      <DialogPrimitive.Title className="sr-only">{t('search')}</DialogPrimitive.Title>
      <div className="flex shrink-0 items-center gap-1 border-b border-ink-200 py-2 ps-1 pe-4">
        <DialogPrimitive.Close asChild>
          <IconButton label={t('back')} icon={<ArrowRight className="ltr:rotate-180" />} />
        </DialogPrimitive.Close>
        <SearchForm onSearch={box.submitted} className="flex-1">
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
            aria-activedescendant={box.activeIndex === -1 ? undefined : optionId(box.activeIndex)}
            value={box.value}
            onChange={(event) => box.setValue(event.target.value)}
            onKeyDown={box.onKeyDown}
            placeholder={t('search_placeholder')}
            className={searchInputClasses('md')}
          />
          <SearchSubmit />
        </SearchForm>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
        // Tapping the list keeps the focus (and the phone's keyboard) on the field.
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
        {box.options.length === 0 && <p className="px-4 py-6 text-center text-ink-600">{HINT}</p>}
      </div>
    </DialogPrimitive.Content>
  )
}

/**
 * The phones' search: a full-screen modal over the page with «بازگشت», the focused field and,
 * under it, the same suggestions and recent searches as the desktop box (useSearchBox, inline:
 * the list is always shown). Radix traps the focus and locks the page's scroll; closing gives
 * the focus back to the header field that opened it. It clears the safe areas (notch and home
 * indicator). Loaded on the first opening (MobileSearch).
 */
export function SearchOverlay({ open, onOpenChange, initialValue = '' }: SearchOverlayProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Radix locks the page's scroll from the overlay layer. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-white" />
        <OverlayContent initialValue={initialValue} onClose={() => onOpenChange(false)} />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
