'use client'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { RichContentBody } from '@/features/content/rich-content-body'

export interface ReadingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Sanitised operator HTML (`richContentHtml`, on the server). */
  html: string
}

/** Operator text in a large dialog. Loaded on the first opening by `ReadingButton`. */
export function ReadingDialog({ open, onOpenChange, title, html }: ReadingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} size="lg">
        <RichContentBody html={html} className="rich-content" />
      </DialogContent>
    </Dialog>
  )
}
