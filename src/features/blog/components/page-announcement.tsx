'use client'

import { useEffect, useRef } from 'react'
import { announce } from '@/components/ui/live-announcer'

/**
 * Reads `text` out (the shop's polite region) when `trigger` changes while the page stays on
 * screen: a pager link or a search moves to another page of the same listing, as the catalog's
 * results announce their count. Nothing on the first render: a new page reads its own heading.
 */
export function PageAnnouncement({ text, trigger }: { text: string; trigger: string }) {
  const shown = useRef(trigger)
  useEffect(() => {
    if (shown.current === trigger) return
    shown.current = trigger
    announce(text)
  }, [text, trigger])
  return null
}
