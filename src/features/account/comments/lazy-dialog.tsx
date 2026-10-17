'use client'

import dynamic from 'next/dynamic'
import { OverlayLoading, OverlayUnavailable } from '../overlay-fallbacks'
import type { DeleteCommentDialogProps } from './delete-comment-dialog'

// The delete question (Radix Dialog) loads on the first press of «حذف دیدگاه», or as the pointer
// or the focus reaches one: the page's first load stays within the JS budget (P2-R4).

export const LazyDeleteCommentDialog = dynamic<DeleteCommentDialogProps>(
  () =>
    import('./delete-comment-dialog')
      .then((module) => module.DeleteCommentDialog)
      .catch(() => OverlayUnavailable),
  { ssr: false, loading: OverlayLoading },
)

/** A failed preload is dropped: the press tries again. */
export const preloadDeleteCommentDialog = () => {
  import('./delete-comment-dialog').catch(() => {})
}
