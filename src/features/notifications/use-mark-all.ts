'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { tell } from '@/features/account/tell'
import { ApiError, isApiNotFound } from '@/lib/api/errors'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { fetchUnreadIds, markNotificationRead } from './notifications-api'
import {
  dropRow,
  holdInboxReads,
  refreshInbox,
  rowRead,
  setRowRead,
  shiftUnread,
} from './notifications-cache'
import { readFailure } from './use-mark-read'
import { UNREAD_NOTIFICATIONS_KEY } from './unread'

/** A 429 longer than this is not waited out: the loop stops and says so. */
export const MAX_THROTTLE_WAIT_S = 60

export const ALL_READ = 'همه اعلان‌ها خوانده شد.'

export interface MarkAllState {
  /** idle, going through the ids, waiting out a 429, or stopped by a failure. */
  phase: 'idle' | 'running' | 'waiting' | 'failed'
  done: number
  total: number
  /** Why it stopped (`failed`). */
  failure: string | null
}

const IDLE: MarkAllState = { phase: 'idle', done: 0, total: 0, failure: null }

/** Resolves after `seconds`, or rejects at once when `signal` aborts. */
function wait(seconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop)
      resolve()
    }, seconds * 1000)
    signal.addEventListener('abort', stop, { once: true })
  })
}

/**
 * «علامت‌گذاری همه به‌عنوان خوانده‌شده» (the API has no mark-all, digest §4.2): the unread ids are
 * read the way the count reads them (every page, not just those on screen), then each is marked
 * read in turn, one request at a time, each row and the count changing as it goes («۳ از ۱۰»).
 * A 429 waits out `retry_after` and goes on (stops and says so past a minute); a 404 (gone) takes
 * the row out; a 401 that means the session is gone goes to login; any other failure stops with
 * the reason. Leaving the page stops it. At the end the inbox and the count are read again.
 */
export function useMarkAll(): { state: MarkAllState; start: () => void } {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const [state, setState] = useState<MarkAllState>(IDLE)
  const run = useRef<AbortController | null>(null)

  useEffect(() => () => run.current?.abort(), [])

  async function markAll(signal: AbortSignal) {
    setState({ ...IDLE, phase: 'running' })
    const ids = await fetchUnreadIds(signal)
    client.setQueryData(UNREAD_NOTIFICATIONS_KEY, ids.length)
    setState((current) => ({ ...current, total: ids.length }))
    for (const [index, id] of ids.entries()) {
      // Opened (and so marked read) meanwhile: done, and counted out already.
      while (rowRead(client, id) !== true) {
        signal.throwIfAborted()
        try {
          await markNotificationRead(id, signal)
          await holdInboxReads(client)
          // Opened while its request was on its way: the count has gone down for it already.
          if (rowRead(client, id) !== true) shiftUnread(client, -1)
          setRowRead(client, id, true)
          break
        } catch (error) {
          if (isApiNotFound(error)) {
            dropRow(client, id)
            shiftUnread(client, -1)
            break
          }
          const retryAfter = error instanceof ApiError && error.status === 429 && error.retryAfter
          if (!retryAfter || retryAfter > MAX_THROTTLE_WAIT_S) throw error
          setState((current) => ({ ...current, phase: 'waiting' }))
          await wait(retryAfter, signal)
          setState((current) => ({ ...current, phase: 'running' }))
        }
      }
      setState((current) => ({ ...current, done: index + 1 }))
    }
    setState(IDLE)
    tell(ALL_READ)
  }

  function start() {
    if (run.current) return
    const controller = new AbortController()
    run.current = controller
    markAll(controller.signal)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isSessionExpiredError(error)) return expire({ toLogin: true })
        setState((current) => ({ ...current, phase: 'failed', failure: readFailure(error) }))
      })
      .finally(() => {
        if (run.current === controller) run.current = null
        if (!controller.signal.aborted) void refreshInbox(client)
      })
  }

  return { state, start }
}
