'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useHydrated } from '@/components/ui/use-media-query'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { useT } from '@/lib/i18n/i18n-context'
import { SEARCH_INPUT_PROPS, SearchForm, SearchSubmit } from './search-form'
import { searchInputClasses } from './search-field'
import type { SearchOverlayProps } from './search-overlay'

type OverlayProps = SearchOverlayProps & { onUnavailable: () => void }

/** Stands in for the overlay when its code could not be downloaded: the field goes plain. */
function OverlayUnavailable({ onUnavailable }: OverlayProps) {
  useEffect(() => onUnavailable(), [onUnavailable])
  return null
}

// The overlay's code loads on the first opening (or when the field is pressed). A failed
// download resolves to OverlayUnavailable: next/dynamic's `loading` never sees the error, and
// React.lazy would throw it (and keep throwing it) to the page's error boundary.
const SearchOverlay = dynamic<OverlayProps>(
  () =>
    import('./search-overlay')
      .then((module) => module.SearchOverlay)
      .catch(() => OverlayUnavailable),
  { ssr: false },
)
/** A failed preload is dropped: the first opening imports the code itself. */
const preloadOverlay = () => {
  import('./search-overlay').catch(() => {})
}

/** Keys that open the overlay without typing anything. */
const OPENING_KEYS = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp'])

interface OverlayState {
  open: boolean
  /** Mounted since the first opening (so it can animate out and give the focus back). */
  mounted: boolean
  initialValue: string
}

/**
 * The phone header's search field. The server and a page without JS get the plain GET form to
 * `/search/`. Once hydrated, the field is a read-only trigger (`aria-haspopup="dialog"`): a tap,
 * Enter, Space, an arrow or a typed key opens SearchOverlay (the key typed is kept), and so does
 * the magnifier. A navigation of the page behind closes it. If the overlay's code cannot load,
 * or it fails to render, the field goes back to being the plain form's input, focused for
 * typing.
 */
export function MobileSearch({ className }: { className?: string }) {
  const t = useT()
  const id = useId()
  const fieldRef = useRef<HTMLInputElement>(null)
  const hydrated = useHydrated()
  const [failed, setFailed] = useState(false)
  const [state, setState] = useState<OverlayState>({
    open: false,
    mounted: false,
    initialValue: '',
  })
  const overlay = hydrated && !failed
  const markFailed = useCallback(() => setFailed(true), [])

  // The header outlives the page: a navigation behind the overlay (the phone's Back button)
  // closes it (adjusting state during render, as React recommends for changed inputs).
  const pathname = usePathname()
  const [shownOn, setShownOn] = useState(pathname)
  if (pathname !== shownOn) {
    setShownOn(pathname)
    if (state.open) setState({ ...state, open: false })
  }

  useEffect(() => {
    if (failed) fieldRef.current?.focus()
  }, [failed])

  const openWith = (initialValue: string) => setState({ open: true, mounted: true, initialValue })

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    const typed = Array.from(event.key).length === 1 && event.key !== ' '
    if (!typed && !OPENING_KEYS.has(event.key)) return
    event.preventDefault()
    openWith(event.currentTarget.value + (typed ? event.key : ''))
  }

  return (
    <>
      <SearchForm className={className}>
        <label htmlFor={id} className="sr-only">
          {t('search')}
        </label>
        <input
          ref={fieldRef}
          id={id}
          {...SEARCH_INPUT_PROPS}
          readOnly={overlay}
          aria-haspopup={overlay ? 'dialog' : undefined}
          onPointerDown={overlay ? preloadOverlay : undefined}
          onClick={overlay ? (event) => openWith(event.currentTarget.value) : undefined}
          onKeyDown={overlay ? onKeyDown : undefined}
          placeholder={t('search_placeholder')}
          className={searchInputClasses('md')}
        />
        <SearchSubmit
          onClick={
            overlay
              ? (event) => {
                  event.preventDefault()
                  openWith(fieldRef.current?.value ?? '')
                }
              : undefined
          }
        />
      </SearchForm>
      {overlay && state.mounted && (
        <WidgetBoundary name="search-overlay" onError={markFailed}>
          <SearchOverlay
            open={state.open}
            initialValue={state.initialValue}
            onOpenChange={(open) => setState((current) => ({ ...current, open }))}
            onUnavailable={markFailed}
          />
        </WidgetBoundary>
      )}
    </>
  )
}
