'use client'

import { Dialog as DialogPrimitive } from 'radix-ui'
import { useRef, type ComponentProps, type ReactNode } from 'react'
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

/** A modal dialog (Radix): focus is trapped inside, Escape and the backdrop close it. */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const

export interface DialogContentProps extends Omit<
  ComponentProps<typeof DialogPrimitive.Content>,
  'title'
> {
  /** Always rendered; it names the dialog. `hideTitle` keeps it for screen readers only. */
  title: ReactNode
  description?: ReactNode
  hideTitle?: boolean
  /** Actions pinned below the scrolling body. */
  footer?: ReactNode
  size?: keyof typeof SIZES
}

// Text-like fields a form dialog should start in.
const FIELD =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)'

/**
 * The centred panel with its backdrop, header (title, description, ×), scrolling body and
 * optional footer. It never grows taller than the viewport. On open, focus goes to the first
 * field in the body (a form dialog), otherwise to the first button (the ×).
 */
export function DialogContent({
  title,
  description,
  hideTitle = false,
  footer,
  size = 'md',
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  const body = useRef<HTMLDivElement>(null)
  const returnFocus = useReturnFocus({
    onOpenAutoFocus(event) {
      onOpenAutoFocus?.(event)
      if (event.defaultPrevented) return
      const field = body.current?.querySelector<HTMLElement>(FIELD)
      if (!field) return
      field.focus()
      // A field that cannot take focus (inside a hidden section, say) leaves Radix's default.
      if (document.activeElement === field) event.preventDefault()
    },
    onCloseAutoFocus,
  })
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn(OVERLAY, OVERLAY_MOTION)} />
      <DialogPrimitive.Content
        // Without a description, opt out of Radix's aria-describedby (and its warning).
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[calc(100dvh-2rem)] -translate-y-1/2 flex-col',
          'rounded-card bg-white shadow-raised outline-none',
          'motion-safe:data-[state=closed]:animate-dialog-out motion-safe:data-[state=open]:animate-dialog-in',
          SIZES[size],
          className,
        )}
        {...props}
        {...returnFocus}
      >
        <PanelHeader
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
        {children && (
          <div ref={body} className={cn(PANEL_BODY, 'sm:pb-6')}>
            {children}
          </div>
        )}
        {footer && <div className={cn(PANEL_FOOTER, 'rounded-b-card')}>{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
