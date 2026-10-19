'use client'

import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'

export interface SlotDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names the dialog: the slot's own name. */
  title: string
  /** The slot's content, rendered on the server. */
  children: ReactNode
}

/**
 * A slot's content in a modal dialog (the kit's Dialog): named by its title, the focus on its
 * «بستن» (×) at once, never on a link inside the content; Escape, the backdrop and «بستن» in
 * its footer close it, and the focus goes back to the button that opened it. Loaded on the
 * first press of `SlotDialogLink`.
 */
export function SlotDialog({ open, onOpenChange, title, children }: SlotDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        size="lg"
        footer={<DialogClose className={buttonClasses({ variant: 'outline' })}>بستن</DialogClose>}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}
