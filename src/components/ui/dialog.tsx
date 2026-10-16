'use client'

import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
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

/**
 * The centred panel with its backdrop, header (title, description, ×), scrolling body and
 * optional footer. It never grows taller than the viewport.
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
  const returnFocus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus })
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
        {children && <div className={cn(PANEL_BODY, 'sm:pb-6')}>{children}</div>}
        {footer && <div className={cn(PANEL_FOOTER, 'rounded-b-card')}>{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
