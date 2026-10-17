'use client'

import { usePathname } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { useHydrated } from '@/components/ui/use-media-query'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { useT } from '@/lib/i18n/i18n-context'
import {
  loadOverlay,
  loadedOverlay,
  preloadOverlayOnFirstInteraction,
  type OverlayComponent,
} from './overlay-loader'
import { SEARCH_INPUT_PROPS, SearchForm, SearchSubmit } from './search-form'
import { searchInputClasses } from './search-field'

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
 * `/search/`; a field already focused when the page hydrates stays that plain field until it
 * loses the focus, so typing is never interrupted.
 *
 * Once hydrated it is a real, writable field that opens SearchOverlay (`aria-haspopup="dialog"`)
 * on a tap, Enter, Space, an arrow or a typed key (the key typed is kept), and so does the
 * magnifier. The tap focuses this field inside the gesture, so iOS raises the keyboard. On touch
 * phones the overlay's code is preloaded at the visitor's first touch, scroll or key press on the
 * page, or when this field is focused or pressed; with the code in, the overlay opens in the same
 * task (`flushSync`) and its field takes the focus while the gesture lasts. Without it yet, the
 * focus stays here, what is typed lands here, and the overlay opens with it once the code
 * arrives. (The iOS behaviour is not verified on a real iPhone.)
 *
 * After the overlay closes, the focus comes back here read-only, so it does not raise the
 * keyboard again; it is writable once it loses the focus or opens again. A navigation of the
 * page behind closes the overlay. If the overlay's code cannot load, or it fails to render, the
 * field stays the plain form's input, focused for typing.
 */
export function MobileSearch({ className }: { className?: string }) {
  const t = useT()
  const id = useId()
  const fieldRef = useRef<HTMLInputElement>(null)
  const hydrated = useHydrated()
  const [failed, setFailed] = useState(false)
  // Focused before the page hydrated (a fast tap on a slow page): the visitor may be typing in
  // it. It stays a plain field, with what it holds, until it loses the focus; then it becomes
  // the overlay's trigger like any other time. Read once, from the DOM the server rendered.
  const [typingFirst, setTypingFirst] = useState(
    () => typeof document !== 'undefined' && document.activeElement?.id === id,
  )
  const [Overlay, setOverlay] = useState<OverlayComponent | null>(loadedOverlay)
  const [state, setState] = useState<OverlayState>({
    open: false,
    mounted: false,
    initialValue: '',
  })
  const [returning, setReturning] = useState(false)
  const overlay = hydrated && !failed && !typingFirst
  const markFailed = useCallback(() => setFailed(true), [])

  // The header outlives the page: a navigation behind the overlay (the phone's Back button)
  // closes it (adjusting state during render, as React recommends for changed inputs).
  const pathname = usePathname()
  const [shownOn, setShownOn] = useState(pathname)
  if (pathname !== shownOn) {
    setShownOn(pathname)
    if (state.open) setState({ ...state, open: false })
  }

  // In the commit that makes the field plain, not after it: a passive effect can run a task
  // later (React yields between the two when the main thread is busy), leaving the field
  // without the focus in between.
  useLayoutEffect(() => {
    if (failed) fieldRef.current?.focus()
  }, [failed])

  useEffect(() => preloadOverlayOnFirstInteraction((loaded) => setOverlay(() => loaded)), [])

  const load = () =>
    loadOverlay().then((loaded) => {
      if (loaded) setOverlay(() => loaded)
      return loaded
    })

  const open = (initialValue: string) => {
    if (Overlay) {
      // Rendered and focused before this event handler returns: still inside the gesture.
      flushSync(() => {
        setReturning(false)
        setState({ open: true, mounted: true, initialValue })
      })
      return
    }
    setReturning(false)
    setState({ open: true, mounted: true, initialValue })
    void load().then((loaded) => {
      if (!loaded) return markFailed()
      // What was typed here meanwhile is where the overlay starts.
      const typed = fieldRef.current?.value
      setState((current) => ({ ...current, initialValue: typed ?? current.initialValue }))
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    const typed = Array.from(event.key).length === 1 && event.key !== ' '
    if (!typed && !OPENING_KEYS.has(event.key)) return
    if (!Overlay) {
      // The code is on its way: a typed key lands in this field, Enter still submits the form.
      if (!typed && event.key !== 'Enter') event.preventDefault()
      if (event.key !== 'Enter' && !state.open) open(event.currentTarget.value)
      return
    }
    event.preventDefault()
    open(event.currentTarget.value + (typed ? event.key : ''))
  }

  const onBlur = () => {
    if (typingFirst) setTypingFirst(false)
    if (returning) setReturning(false)
    // Left before the code arrived: the visitor moved on, the overlay must not pop up later.
    if (state.open && !Overlay) setState((current) => ({ ...current, open: false }))
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
          readOnly={overlay && returning}
          aria-haspopup={overlay ? 'dialog' : undefined}
          onPointerDown={overlay && !Overlay ? () => void load() : undefined}
          onFocus={overlay && !Overlay ? () => void load() : undefined}
          onClick={overlay ? (event) => open(event.currentTarget.value) : undefined}
          onBlur={onBlur}
          onKeyDown={overlay ? onKeyDown : undefined}
          placeholder={t('search_placeholder')}
          className={searchInputClasses('md')}
        />
        <SearchSubmit
          onClick={
            overlay
              ? (event) => {
                  event.preventDefault()
                  open(fieldRef.current?.value ?? '')
                }
              : undefined
          }
        />
      </SearchForm>
      {overlay && state.mounted && Overlay && (
        <WidgetBoundary name="search-overlay" onError={markFailed}>
          <Overlay
            open={state.open}
            initialValue={state.initialValue}
            onOpenChange={(next) => {
              setState((current) => ({ ...current, open: next }))
              if (!next) setReturning(true)
            }}
          />
        </WidgetBoundary>
      )}
    </>
  )
}
