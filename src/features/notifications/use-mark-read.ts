'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { notify } from '@/components/ui/toaster'
import { THROTTLED_MESSAGE } from '@/features/account/lists/list-error'
import { ApiError, GENERIC_ERROR_DETAIL, isApiNotFound } from '@/lib/api/errors'
import type { NotificationItem } from '@/lib/api/types/notification'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { markNotificationRead } from './notifications-api'
import { dropRow, holdInboxReads, setRowRead, shiftUnread } from './notifications-cache'

/** Why a read could not be written: the API's words, or a calm one for a 429. */
export function readFailure(error: unknown): string {
  if (error instanceof ApiError) return error.status === 429 ? THROTTLED_MESSAGE : error.detail
  return GENERIC_ERROR_DETAIL
}

/**
 * Opening an unread notification marks it read (`POST notification/<id>/read/`, digest §4.2), at
 * once on screen: the row reads as read and the unread count drops before the API answers. A
 * failure puts both back and says why; a 404 (the shop deleted it) takes the row out and reads
 * the inbox again; a 401 that means the session is gone goes to login. One request per
 * notification however often it is opened. Never called for a push: a push cannot be matched to
 * a row.
 */
export function useMarkRead(): (item: NotificationItem) => void {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const sending = useRef(new Set<number>())

  async function markRead({ id }: NotificationItem) {
    // What the row is on screen now; written again over «نمایش بیشتر»'s page if one lands later.
    let outcome: 'read' | 'unread' | 'gone' = 'read'
    const resume = await holdInboxReads(client, () => {
      if (outcome === 'read') setRowRead(client, id, true)
      else if (outcome === 'gone') dropRow(client, id)
    })
    setRowRead(client, id, true)
    shiftUnread(client, -1)
    let refresh = false
    try {
      await markNotificationRead(id)
    } catch (error) {
      if (isSessionExpiredError(error)) return expire({ toLogin: true })
      if (isApiNotFound(error)) {
        outcome = 'gone'
        dropRow(client, id)
        // The inbox and the count are read again (`resume`), once.
        refresh = true
        return
      }
      outcome = 'unread'
      setRowRead(client, id, false)
      shiftUnread(client, 1)
      notify.error(readFailure(error))
    } finally {
      resume({ refresh })
    }
  }

  return (item) => {
    if (item.is_read || sending.current.has(item.id)) return
    sending.current.add(item.id)
    void markRead(item).finally(() => sending.current.delete(item.id))
  }
}
