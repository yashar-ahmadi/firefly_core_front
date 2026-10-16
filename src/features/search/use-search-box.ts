'use client'

import { useRouter } from 'next/navigation'
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { isModifiedClick } from '@/lib/navigation/modified-click'
import { usePersistHydration } from '@/lib/store/persisted'
import { searchHref } from './query'
import { useRecentSearches } from './recent-searches'
import { suggestOptions, typedTerm, type SuggestOption } from './suggest-options'
import { useSuggestions } from './use-suggestions'

export interface SearchBox {
  value: string
  /** What the field shows: typing also clears the highlight and opens the list. */
  setValue: (value: string) => void
  options: SuggestOption[]
  /** The highlighted option's index in `options`, or -1. */
  activeIndex: number
  /** The list is on screen (`aria-expanded`). */
  expanded: boolean
  /** The list on screen is the recent searches (the field is empty). */
  recentShown: boolean
  /** Suggestions for the current term are still to come. */
  loading: boolean
  /** How many products, categories and brands are suggested. */
  suggestionCount: number
  open: () => void
  close: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  /** Acts on an option chosen from the keyboard or by a click on a non-link option. */
  choose: (option: SuggestOption) => void
  /**
   * A suggestion link was clicked: its navigation is the link's own. A modified click (a new
   * tab or window) leaves the box as it is and remembers nothing.
   */
  follow: (event: MouseEvent) => void
  /** The form was submitted. */
  submitted: () => void
  removeRecent: (term: string) => void
  clearRecent: () => void
}

/**
 * The state and keyboard of a search combobox (ARIA 1.2, list autocomplete), shared by the
 * desktop suggest box and the phone overlay:
 * - Down and Up move the highlight through the options, wrapping at both ends (opening the
 *   list first when it is closed); typing clears the highlight.
 * - Enter goes to the highlighted option; with none, the form submits as usual.
 * - Escape closes the list, then (closed) clears the field. A handler that already took the
 *   key (the overlay's dialog) wins.
 * - Delete or Backspace forgets the highlighted recent search and moves the highlight to the
 *   next one. Recent searches are listed only while the field holds nothing searchable (empty,
 *   or spaces alone), so the key would at most have deleted a space. A held key removes one:
 *   its auto-repeats are swallowed.
 * Choosing anything remembers the query among the recent searches. `inline` lists are always
 * shown (the overlay); others open on focus and typing. `onDone` runs after a navigation.
 */
export function useSearchBox({
  inline = false,
  initialValue = '',
  onDone,
}: { inline?: boolean; initialValue?: string; onDone?: () => void } = {}): SearchBox {
  const router = useRouter()
  const [value, setValueState] = useState(initialValue)
  const [open, setOpen] = useState(inline)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const { data, isLoading } = useSuggestions(value)
  const hydrated = usePersistHydration(useRecentSearches)
  const recent = useRecentSearches((state) => state.items)
  const add = useRecentSearches((state) => state.add)
  const remove = useRecentSearches((state) => state.remove)
  const clear = useRecentSearches((state) => state.clear)

  const options = suggestOptions(value, data, hydrated ? recent : [])
  const expanded = (inline || open) && options.length > 0
  const activeIndex = expanded ? options.findIndex((option) => option.key === activeKey) : -1
  const active = options[activeIndex]

  const finish = () => {
    setOpen(inline)
    setActiveKey(null)
    onDone?.()
  }

  const choose = (option: SuggestOption) => {
    if (option.kind === 'suggestion') {
      add(value)
      router.push(option.item.url)
    } else {
      add(option.term)
      if (option.kind === 'recent') setValueState(option.term)
      router.push(searchHref(option.term))
    }
    finish()
  }

  const move = (step: 1 | -1) => {
    const count = options.length
    if (count === 0) return
    setOpen(true)
    const from = activeIndex === -1 ? (step === 1 ? -1 : count) : activeIndex
    setActiveKey(options[(from + step + count) % count]!.key)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (options.length === 0) return
        event.preventDefault()
        move(event.key === 'ArrowDown' ? 1 : -1)
        return
      case 'Enter':
        if (!active) return
        event.preventDefault()
        choose(active)
        return
      case 'Escape':
        if (expanded && !inline) {
          event.preventDefault()
          setOpen(false)
          setActiveKey(null)
        } else if (value !== '') {
          event.preventDefault()
          setValueState('')
          setActiveKey(null)
        }
        return
      case 'Delete':
      case 'Backspace': {
        if (active?.kind !== 'recent') return
        event.preventDefault()
        if (event.repeat) return
        const next = options[activeIndex + 1] ?? options[activeIndex - 1]
        remove(active.term)
        setActiveKey(next?.key ?? null)
        return
      }
    }
  }

  return {
    value,
    setValue: (next) => {
      setValueState(next)
      setActiveKey(null)
      setOpen(true)
    },
    options,
    activeIndex,
    expanded,
    recentShown: expanded && options[0]?.kind === 'recent',
    loading: isLoading,
    suggestionCount: options.filter((option) => option.kind === 'suggestion').length,
    open: () => setOpen(true),
    close: () => {
      setOpen(inline)
      setActiveKey(null)
    },
    onKeyDown,
    choose,
    follow: (event) => {
      if (isModifiedClick(event)) return
      if (typedTerm(value) !== '') add(value)
      finish()
    },
    submitted: finish,
    removeRecent: remove,
    clearRecent: clear,
  }
}
