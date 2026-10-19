'use client'

import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OFFLINE_RETRY } from './offline-text'

/**
 * The offline page's retry: the page in the address bar is the one the visitor asked for (the
 * service worker showed the offline page in its place), so a reload asks the network for it again.
 */
export function OfflineRetry() {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      {OFFLINE_RETRY}
    </Button>
  )
}
