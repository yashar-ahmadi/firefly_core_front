import { X } from 'lucide-react'
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { cn } from './cn'
import { IconButton } from './icon-button'

// Shared look of modal panels: Dialog, Drawer and both Sheet variants. Each panel wraps these
// pieces in its own primitive's Title, Description and Close.

/** The dimmed, blurred page behind a modal panel. */
export const OVERLAY = 'fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-sm'
export const OVERLAY_MOTION =
  'motion-safe:data-[state=open]:animate-fade-in motion-safe:data-[state=closed]:animate-fade-out'

/** Popovers and menus: a white card with a soft shadow that grows from its trigger. */
export const FLOATING_PANEL = cn(
  'z-50 rounded-card border border-ink-200 bg-white text-ink-800 shadow-raised outline-none',
  'motion-safe:data-[state=closed]:animate-menu-out motion-safe:data-[state=open]:animate-menu-in',
)

export const PANEL_TITLE = 'text-lg leading-8 font-bold text-ink-900'
export const PANEL_DESCRIPTION = 'mt-0.5 text-base text-ink-600'
/** The scrolling middle of a panel; header and footer stay put. */
export const PANEL_BODY =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 text-base text-ink-800 sm:px-6'
/** Always visible at the bottom; clears the iPhone home indicator. */
export const PANEL_FOOTER =
  'flex shrink-0 flex-wrap items-center gap-3 border-t border-ink-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6'

/** Title block at the start, close button at the end. */
export function PanelHeader({
  close,
  children,
  className,
}: {
  close: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex shrink-0 items-start gap-3 px-4 pt-4 pb-3 sm:px-6', className)}>
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
      {close}
    </div>
  )
}

/** The × button; render it through a primitive's `Close asChild`. */
export function PanelCloseButton({
  className,
  ...props
}: Omit<ComponentProps<typeof IconButton>, 'label' | 'icon'>) {
  return <IconButton label="بستن" icon={<X />} className={cn('-me-2', className)} {...props} />
}

// Safari does not focus a button when it is clicked, so `document.activeElement` is <body> (or
// a focusable container such as an open panel) when a panel opens from a click there. So the
// element last pressed (captured on pointerdown and click) is recorded too, and a key press
// forgets it, because focus is accurate again. One set of listeners serves every panel.
const FOCUSABLE =
  'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]'
let lastPressed: Element | null = null
let tracking = false

function trackPresses() {
  if (tracking) return
  tracking = true
  const remember = (event: Event) => {
    lastPressed = event.target instanceof Element ? event.target : null
  }
  document.addEventListener('pointerdown', remember, true)
  document.addEventListener('click', remember, true)
  document.addEventListener('keydown', () => (lastPressed = null), true)
}

/** Who opened a panel, best first: the element just pressed, then the focused one. */
function openers(): HTMLElement[] {
  const candidates = [lastPressed?.closest(FOCUSABLE), document.activeElement]
  return candidates.filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && element !== document.body,
  )
}

/**
 * Focus handlers for a modal panel's Content. Radix moves focus back only to its own Trigger,
 * so a panel opened from code (a controlled Sheet, or a Dialog opened after a request) would
 * drop focus to <body> on close. This returns it to the element that opened the panel.
 */
export function useReturnFocus(
  handlers: {
    onOpenAutoFocus?: (event: Event) => void
    onCloseAutoFocus?: (event: Event) => void
  } = {},
) {
  const previous = useRef<HTMLElement[]>([])
  useEffect(trackPresses, [])
  return {
    onOpenAutoFocus(event: Event) {
      // Runs before focus moves into the panel, so this is still the opener.
      previous.current = openers()
      handlers.onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus(event: Event) {
      handlers.onCloseAutoFocus?.(event)
      // The first that is still on the page (a pressed menu item may be gone by now).
      const element = previous.current.find((candidate) => candidate.isConnected)
      previous.current = []
      if (event.defaultPrevented || !element) return
      event.preventDefault()
      element.focus()
    },
  }
}
