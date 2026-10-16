'use client'

import type { ReactNode } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { SHEET_SIDE_QUERY, Sheet } from '@/components/ui/sheet'
import { useMediaQuery } from '@/components/ui/use-media-query'

export interface QuickViewPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names the panel: the product once it is known. */
  title: ReactNode
  children: ReactNode
}

/**
 * Quick view's frame: a bottom sheet below md (drag down or tap the backdrop to close) and a
 * wide centred dialog from md. Both are modal: the focus is trapped inside and given back to
 * the opener on close. It is only ever rendered after a press, so the viewport is known.
 */
export function QuickViewPanel({ open, onOpenChange, title, children }: QuickViewPanelProps) {
  const wide = useMediaQuery(SHEET_SIDE_QUERY)
  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title={title} size="lg" className="max-w-4xl">
          {children}
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      {children}
    </Sheet>
  )
}
