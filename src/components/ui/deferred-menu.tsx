'use client'

import { Spinner } from './spinner'
import {
  cloneElement,
  useRef,
  useState,
  type ComponentType,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

/** How the menu was asked for: from the keyboard, its first item takes the focus. */
export interface MenuOpening {
  byKeyboard: boolean
}

/** What the lazily loaded menu receives besides the caller's props. */
export interface DeferredMenuProps {
  /** The menu button: render it as the Radix trigger (`asChild`). */
  trigger: ReactElement
  opening: MenuOpening
}

type TriggerProps = {
  children?: ReactNode
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: boolean
  'aria-busy'?: boolean
  onPointerEnter?: () => void
  onFocus?: () => void
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onClick?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
}

/** Keys that open a Radix menu from its button. */
const OPENING_KEYS = new Set(['Enter', ' ', 'ArrowDown'])

/**
 * A menu button whose menu code (a Radix dropdown and its positioning library, about 20 KB
 * gzip) is not part of the page. Until it is used, `trigger` is shown as a stand-in with the
 * menu-button semantics. Hovering or focusing it starts the download (`load`); a press, Enter,
 * Space or Down opens the menu as soon as the code is in (until then the button shows a small
 * spinner and is `aria-busy`). Then `load`'s component takes over,
 * opened, with `trigger` as its own button. A failed download calls `onUnavailable`: the caller
 * degrades where it is (e.g. follows the menu's own page).
 */
export function DeferredMenu<P extends object>({
  load,
  props,
  trigger,
  onUnavailable,
}: {
  load: () => Promise<ComponentType<P & DeferredMenuProps>>
  props: P
  trigger: ReactElement<TriggerProps>
  onUnavailable: () => void
}) {
  const [opening, setOpening] = useState<MenuOpening | null>(null)
  const [Menu, setMenu] = useState<ComponentType<P & DeferredMenuProps> | null>(null)

  if (Menu && opening) return <Menu {...props} trigger={trigger} opening={opening} />

  const preload = () => {
    load().catch(() => {})
  }
  const open = (byKeyboard: boolean) => {
    if (opening) return
    setOpening({ byKeyboard })
    load()
      .then((component) => setMenu(() => component))
      .catch(() => {
        setOpening(null)
        onUnavailable()
      })
  }

  return cloneElement(
    trigger,
    {
      'aria-haspopup': 'menu',
      'aria-expanded': false,
      'aria-busy': opening ? true : undefined,
      onPointerEnter: preload,
      onFocus: preload,
      onPointerDown: (event) => {
        // Radix opens its menu on any primary press (pointerdown, whatever the pointer). The
        // stand-in does so for a mouse only; a touch or pen press opens on the click that
        // follows, so a scroll that starts on the button does not open the menu.
        if (event.pointerType !== 'mouse' || event.button !== 0 || event.ctrlKey) return
        event.preventDefault()
        open(false)
      },
      onClick: () => open(false),
      onKeyDown: (event) => {
        if (!OPENING_KEYS.has(event.key)) return
        event.preventDefault()
        open(true)
      },
    },
    // Pressed before the code is in: a spinner says it is on its way (`aria-busy` tells AT).
    ...(opening ? [trigger.props.children, <Spinner key="pending" size="sm" />] : []),
  )
}

/**
 * Props for the menu's content: opened from the keyboard, its first item takes the focus when
 * Radix focuses the content on opening (Radix only does that itself when the key reached its
 * own button, which was not on the page yet).
 */
export function useFirstItemFocus(opening: MenuOpening) {
  const done = useRef(!opening.byKeyboard)
  return {
    onFocus(event: FocusEvent<HTMLDivElement>) {
      if (done.current || event.target !== event.currentTarget) return
      done.current = true
      event.currentTarget
        .querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')
        ?.focus()
    },
  }
}
