'use client'

import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactElement, ReactNode } from 'react'
import { cn } from './cn'
import {
  OVERLAY,
  OVERLAY_MOTION,
  PANEL_BODY,
  PANEL_DESCRIPTION,
  PANEL_FOOTER,
  PANEL_TITLE,
  PanelCloseButton,
  PanelHeader,
  useReturnFocus,
} from './overlay-panel'

export type DrawerSide = 'start' | 'end'

export interface DrawerPanelProps {
  /** Always rendered; it names the drawer. `hideTitle` keeps it for screen readers only. */
  title: ReactNode
  description?: ReactNode
  hideTitle?: boolean
  /** `start` is the right edge in RTL (menus); `end` the left edge. */
  side?: DrawerSide
  /** Pinned below the scrolling body. */
  footer?: ReactNode
  children: ReactNode
  className?: string
  /** Where the focus goes as it closes, when its opener may be gone (`event.preventDefault()`). */
  onCloseAutoFocus?: (event: Event) => void
}

// `--drawer-from` is where the slide starts: off the start edge, which is the right in RTL.
const SIDES: Record<DrawerSide, string> = {
  start: 'start-0 rounded-e-card [--drawer-from:100%] ltr:[--drawer-from:-100%]',
  end: 'end-0 rounded-s-card [--drawer-from:-100%] ltr:[--drawer-from:100%]',
}

/**
 * The full-height side panel with its backdrop. Render it inside a Radix Dialog root
 * (`Drawer` does; `Sheet` uses it from `md` up).
 */
export function DrawerPanel({
  title,
  description,
  hideTitle = false,
  side = 'start',
  footer,
  children,
  className,
  onCloseAutoFocus,
}: DrawerPanelProps) {
  const returnFocus = useReturnFocus({ onCloseAutoFocus })
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn(OVERLAY, OVERLAY_MOTION)} />
      <DialogPrimitive.Content
        data-side={side}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...returnFocus}
        className={cn(
          'fixed inset-y-0 z-50 flex h-dvh w-[min(24rem,calc(100vw-3rem))] flex-col bg-white shadow-raised outline-none',
          'motion-safe:data-[state=closed]:animate-drawer-out motion-safe:data-[state=open]:animate-drawer-in',
          SIDES[side],
          className,
        )}
      >
        <PanelHeader
          className="border-b border-ink-100"
          close={
            <DialogPrimitive.Close asChild>
              <PanelCloseButton />
            </DialogPrimitive.Close>
          }
        >
          <DialogPrimitive.Title className={cn(PANEL_TITLE, hideTitle && 'sr-only')}>
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className={PANEL_DESCRIPTION}>
              {description}
            </DialogPrimitive.Description>
          )}
        </PanelHeader>
        <div className={cn(PANEL_BODY, 'pt-3')}>{children}</div>
        {footer && <div className={PANEL_FOOTER}>{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export interface DrawerProps extends DrawerPanelProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  /** An element that opens the drawer, e.g. the header's menu button. */
  trigger?: ReactElement
}

/** A side drawer for menus, sliding in from the start side (right in RTL). */
export function Drawer({ open, onOpenChange, defaultOpen, trigger, ...panel }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DrawerPanel {...panel} />
    </DialogPrimitive.Root>
  )
}
