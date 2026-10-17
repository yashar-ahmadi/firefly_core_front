'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { REFRESH_MESSAGE } from '@/features/pwa/sw-source'
import { refreshInbox } from './notifications-cache'

/**
 * The inbox reads itself again when `/sw.js` says so: after a click on a notification (the window
 * it brought up), and when a push arrives while the inbox is open. Nothing without a worker.
 */
export function useInboxRefresh(): void {
  const client = useQueryClient()
  useEffect(() => {
    const worker = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
    if (!worker) return
    const onMessage = ({ data }: MessageEvent) => {
      const message = typeof data === 'object' && data !== null ? data : {}
      if (message.type === REFRESH_MESSAGE || message.messageType === 'push-received') {
        void refreshInbox(client)
      }
    }
    worker.addEventListener('message', onMessage)
    return () => worker.removeEventListener('message', onMessage)
  }, [client])
}
