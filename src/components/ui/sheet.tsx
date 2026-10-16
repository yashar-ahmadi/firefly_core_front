'use client'

import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { Drawer as Vaul } from 'vaul'
import { cn } from './cn'
import { DrawerPanel } from './drawer'
import {
  OVERLAY,
  PANEL_BODY,
  PANEL_DESCRIPTION,
  PANEL_FOOTER,
  PANEL_TITLE,
  PanelCloseButton,
  PanelHeader,
  useReturnFocus,
} from './overlay-panel'
import { useHydrated, useMediaQuery } from './use-media-query'

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Always rendered; it names the sheet. `hideTitle` keeps it for screen readers only. */
  title: ReactNode
  description?: ReactNode
  hideTitle?: boolean
  children: ReactNode
  /** Pinned at the bottom, e.g. «نمایش نتایج». */
  footer?: ReactNode
  className?: string
}

/** The viewport width from which a sheet becomes a side drawer (Tailwind `md`, 48rem). */
export const SHEET_SIDE_QUERY = '(min-width: 48rem)'

// Vaul's own transition is 500ms; keep its curve but match the other overlays (250ms).
const VAUL_TIMING = { animationDuration: '250ms' }

/**
 * A bottom sheet on phones (Vaul: drag down or tap the backdrop to close) and a side drawer
 * from the start side from `md` up, for filters, sorting and quick choices.
 *
 * Hydration: the variant depends on the viewport, which the server cannot know, so the sheet
 * renders nothing until hydration is over and then the matching variant. A sheet opens on a
 * tap, after hydration, so nothing ever flashes; one rendered open by the server appears
 * right after hydration.
 *
 * State: crossing `md` while the sheet is open (rotating a tablet) swaps the variant and
 * remounts everything inside. Keep filter and form state controlled (in the parent or the URL),
 * never only in uncontrolled inputs inside the sheet, or it resets.
 */
export function Sheet(props: SheetProps) {
  const hydrated = useHydrated()
  const wide = useMediaQuery(SHEET_SIDE_QUERY)
  if (!hydrated) return null

  if (wide) {
    const { open, onOpenChange, ...panel } = props
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DrawerPanel
          side="start"
          {...panel}
          className={cn('w-[min(28rem,85vw)]', panel.className)}
        />
      </DialogPrimitive.Root>
    )
  }
  return <BottomSheet {...props} />
}

function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  children,
  footer,
  className,
}: SheetProps) {
  const returnFocus = useReturnFocus()
  // Vaul skips the open auto-focus by default; a modal must move focus inside (to the ×).
  return (
    <Vaul.Root open={open} onOpenChange={onOpenChange} direction="bottom" autoFocus>
      <Vaul.Portal>
        <Vaul.Overlay className={OVERLAY} style={VAUL_TIMING} />
        <Vaul.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          {...returnFocus}
          style={VAUL_TIMING}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-card bg-white shadow-raised outline-none',
            className,
          )}
        >
          {/* The drag handle; the whole sheet can be dragged, the × is the explicit way out. */}
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-ink-300" />
          <PanelHeader
            className="pt-2"
            close={
              <Vaul.Close asChild>
                <PanelCloseButton />
              </Vaul.Close>
            }
          >
            <Vaul.Title className={cn(PANEL_TITLE, hideTitle && 'sr-only')}>{title}</Vaul.Title>
            {description && (
              <Vaul.Description className={PANEL_DESCRIPTION}>{description}</Vaul.Description>
            )}
          </PanelHeader>
          <div className={PANEL_BODY}>{children}</div>
          {footer && <div className={PANEL_FOOTER}>{footer}</div>}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  )
}
