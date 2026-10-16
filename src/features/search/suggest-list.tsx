'use client'

import { History, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useId, type MouseEvent, type ReactNode } from 'react'
import { CategoryThumb } from '@/components/layout/category-thumb'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { Highlight } from './highlight'
import { SUGGEST_GROUPS, type SuggestOption } from './suggest-options'

/**
 * A row of the list. Hover tints it grey; the highlighted (keyboard) option is tinted brand and
 * marked by a bar at its start edge in brand-600, which stands out at well over 3:1 against
 * the white panel and the tint, so the highlight never rests on a pale background alone.
 */
const OPTION = cn(
  'relative flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-start text-base text-ink-800',
  'transition-colors hover:bg-ink-50 aria-selected:bg-brand-50 aria-selected:text-ink-900',
  'before:absolute before:inset-y-1 before:start-0 before:w-1 before:rounded-e-full before:bg-brand-600',
  'before:opacity-0 aria-selected:before:opacity-100',
)
const GROUP_LABEL = 'px-4 pt-3 pb-1 text-sm font-bold text-ink-600'
const RECENT_LABEL = 'جستجوهای اخیر'

export interface SuggestListProps {
  /** The listbox's id (the input's `aria-controls`). */
  id: string
  options: SuggestOption[]
  activeIndex: number
  /** What is typed: marked in the names. */
  query: string
  /** The element id of option `index` (the input's `aria-activedescendant`). */
  optionId: (index: number) => string
  onChoose: (option: SuggestOption) => void
  onFollow: (event: MouseEvent) => void
  onRemove: (term: string) => void
  onClear: () => void
}

function SuggestionContent({ option, query }: { option: SuggestOption; query: string }) {
  if (option.kind !== 'suggestion') return null
  const { group, item } = option
  const name = <Highlight text={item.name} query={query} />
  if (group === 'products') {
    return (
      <>
        <SmartImage
          src={item.image}
          alt=""
          ratio="1/1"
          sizes="44px"
          className="size-11 shrink-0 rounded-control border border-ink-100 bg-white"
        />
        <span dir="auto" className="line-clamp-2 min-w-0 flex-1 text-start leading-7">
          {name}
        </span>
      </>
    )
  }
  return (
    <>
      <CategoryThumb
        category={{ name: item.name, image: item.image }}
        fit={group === 'brands' ? 'contain' : 'cover'}
        sizes="36px"
        className={cn(
          'size-9 text-base',
          group === 'brands' && 'rounded-control border border-ink-100 bg-white',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </>
  )
}

/** The options for a typed term: «search everywhere», then the suggestions in labelled groups. */
function Suggestions({
  id,
  options,
  activeIndex,
  query,
  optionId,
  onChoose,
  onFollow,
}: SuggestListProps) {
  const labelId = useId()
  const row = (option: SuggestOption): ReactNode => {
    const index = options.indexOf(option)
    const common = { id: optionId(index), role: 'option', 'aria-selected': index === activeIndex }
    if (option.kind === 'suggestion') {
      return (
        <li key={option.key} role="presentation">
          <Link
            {...common}
            href={option.item.url}
            prefetch={false}
            tabIndex={-1}
            onClick={onFollow}
            className={OPTION}
          >
            <SuggestionContent option={option} query={query} />
          </Link>
        </li>
      )
    }
    return (
      <li key={option.key} {...common} onClick={() => onChoose(option)} className={OPTION}>
        <Search aria-hidden className="size-5 shrink-0 text-ink-500" />
        <span className="min-w-0 flex-1 truncate">
          {'جستجوی «'}
          <bdi className="font-bold text-ink-900">{option.term}</bdi>
          {'» در همه\u{0654} محصولات'}
        </span>
      </li>
    )
  }

  return (
    <div role="listbox" id={id} aria-label="پیشنهادهای جستجو">
      <ul role="presentation">{options.filter((option) => option.kind === 'search').map(row)}</ul>
      {SUGGEST_GROUPS.map((group) => {
        const items = options.filter(
          (option) => option.kind === 'suggestion' && option.group === group.key,
        )
        if (items.length === 0) return null
        return (
          <ul key={group.key} role="group" aria-labelledby={`${labelId}-${group.key}`}>
            <li role="presentation" id={`${labelId}-${group.key}`} className={GROUP_LABEL}>
              {group.label}
            </li>
            {items.map(row)}
          </ul>
        )
      })}
    </div>
  )
}

/**
 * The recent searches: options in a listbox, and beside each, outside the listbox (an option
 * may not hold a control), its × button. Rows have one fixed height, so the two columns line
 * up. The × buttons stay out of the tab order: from the keyboard, Delete or Backspace removes
 * the highlighted one (announced by the field's description and each option's
 * `aria-keyshortcuts`); «پاک کردن همه» is a normal button.
 */
function RecentSearches({
  id,
  options,
  activeIndex,
  optionId,
  onChoose,
  onRemove,
  onClear,
}: SuggestListProps) {
  const labelId = useId()
  return (
    <>
      <div className="flex items-center justify-between gap-3 ps-4 pe-2">
        <span id={labelId} className="text-sm font-bold text-ink-600">
          {RECENT_LABEL}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 rounded-control px-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          پاک کردن همه
        </button>
      </div>
      <div className="relative">
        <ul role="listbox" id={id} aria-labelledby={labelId}>
          {options.map((option, index) =>
            option.kind === 'recent' ? (
              <li
                key={option.key}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                aria-keyshortcuts="Delete Backspace"
                onClick={() => onChoose(option)}
                className={cn(OPTION, 'h-11 pe-14')}
              >
                <History aria-hidden className="size-5 shrink-0 text-ink-500" />
                <span className="min-w-0 flex-1 truncate">{option.term}</span>
              </li>
            ) : null,
          )}
        </ul>
        <ul aria-label="حذف از جستجوهای اخیر" className="absolute end-1 top-0">
          {options.map((option) =>
            option.kind === 'recent' ? (
              <li key={option.key} className="grid h-11 place-items-center">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`حذف «${option.term}» از ${RECENT_LABEL}`}
                  onClick={() => onRemove(option.term)}
                  className="grid size-11 place-items-center rounded-control text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ) : null,
          )}
        </ul>
      </div>
    </>
  )
}

/**
 * The listbox of a search combobox: the recent searches while the field is empty, otherwise
 * «search everywhere» and the suggestions. Always rendered (empty while there is nothing), so
 * the input's `aria-controls` always points at it. Pointer presses never take the focus from
 * the input (the caller's panel prevents mousedown).
 */
export function SuggestList(props: SuggestListProps) {
  if (props.options.length === 0)
    return <div role="listbox" id={props.id} aria-label="پیشنهادهای جستجو" />
  return props.options[0]?.kind === 'recent' ? (
    <RecentSearches {...props} />
  ) : (
    <Suggestions {...props} />
  )
}
