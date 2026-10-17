'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type RefObject } from 'react'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { ApiError, GENERIC_ERROR_DETAIL, isApiNotFound } from '@/lib/api/errors'
import type { MyComment } from '@/lib/api/types/dashboard'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError, MY_COMMENTS_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { THROTTLED_MESSAGE } from '../lists/list-error'
import { tell } from '../tell'
import type { CommentsParams } from './comment-params'
import { rowHeading } from './comment-row'
import { commentKey, commentsKey, withdrawComment, type CommentsPage } from './comments-api'
import type { DeleteFailure } from './delete-comment-dialog'

export interface DeletionState {
  open: boolean
  /** Opened once: its code is loaded or loading (kept mounted so it can close). */
  requested: boolean
  comment: MyComment | null
  failure: DeleteFailure | null
  wait: Wait
}

const CLOSED: DeletionState = {
  open: false,
  requested: false,
  comment: null,
  failure: null,
  wait: NO_WAIT,
}

/**
 * «حذف دیدگاه» on «دیدگاه‌های من» (digest §3.6): the question, then the DELETE, once however often
 * it is pressed. After a 204 the row goes from the list on screen at once, the lists and the
 * summary (`comment_count`) are read again and it is said; a 404 (withdrawn already) does the
 * same without a word. The focus then goes to the next row's heading, else the previous one's,
 * else the page's; the last row of a page after the first goes to the page before. A 401 that
 * means the session is gone ends it (login); a 429 waits out `retry_after` in the dialog.
 */
export function useCommentDelete({
  rows,
  params,
  pageHeading,
  goToPage,
}: {
  /** The rows on screen, in order. */
  rows: readonly MyComment[]
  params: CommentsParams
  pageHeading: RefObject<HTMLElement | null>
  goToPage: (page: number) => void
}) {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const [deletion, setDeletion] = useState<DeletionState>(CLOSED)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const sending = useRef(false)
  /** After a delete: the heading of this row (a key), or the page's; null: Radix's own. */
  const focusTarget = useRef<string | 'page' | null>(null)

  function ask(comment: MyComment) {
    focusTarget.current = null
    setDeletion((state) => ({ ...state, open: true, requested: true, comment, failure: null }))
  }

  /** The row is gone: off the list on screen now, everything read again, the focus decided. */
  function gone(comment: MyComment) {
    const key = commentKey(comment)
    const index = rows.findIndex((row) => commentKey(row) === key)
    const remaining = rows.filter((row) => commentKey(row) !== key)
    client.setQueryData<CommentsPage>(commentsKey(params), (page) =>
      page
        ? {
            ...page,
            count: Math.max(0, page.count - 1),
            results: page.results.filter((row) => commentKey(row) !== key),
          }
        : page,
    )
    void client.invalidateQueries({ queryKey: MY_COMMENTS_KEY })
    void client.invalidateQueries({ queryKey: SUMMARY_KEY })
    const next = remaining[Math.max(0, index)] ?? remaining[index - 1]
    focusTarget.current = next ? commentKey(next) : 'page'
    if (remaining.length === 0 && params.page > 1) goToPage(params.page - 1)
    setDeletion((state) => ({ ...state, open: false }))
  }

  async function confirm() {
    const { comment } = deletion
    if (!comment || sending.current) return
    sending.current = true
    setPendingKey(commentKey(comment))
    setDeletion((state) => ({ ...state, failure: null }))
    try {
      await withdrawComment(comment)
      gone(comment)
      tell('دیدگاه حذف شد.')
    } catch (error) {
      // The page is on its way to login: the row and the dialog wait (still pending).
      if (isSessionExpiredError(error)) return expire({ toLogin: true })
      if (isApiNotFound(error)) gone(comment)
      else fail(error)
    }
    sending.current = false
    setPendingKey(null)
  }

  function fail(error: unknown) {
    const throttled = error instanceof ApiError && error.status === 429
    const message = throttled
      ? THROTTLED_MESSAGE
      : error instanceof ApiError
        ? error.detail
        : GENERIC_ERROR_DETAIL
    setDeletion((state) => ({
      ...state,
      failure: { message, throttled },
      wait:
        throttled && error.retryAfter
          ? restartWait(state.wait, Date.now(), error.retryAfter)
          : state.wait,
    }))
  }

  return {
    deletion,
    pendingKey,
    ask,
    confirm: () => void confirm(),
    onOpenChange: (open: boolean) => setDeletion((state) => ({ ...state, open })),
    /** After a delete the opener's row is gone: the focus goes where `gone` decided. */
    onCloseAutoFocus: (event: Event) => {
      const target = focusTarget.current
      if (target === null) return
      focusTarget.current = null
      event.preventDefault()
      const heading = target === 'page' ? pageHeading.current : rowHeading(target)
      ;(heading ?? pageHeading.current)?.focus()
    },
  }
}
