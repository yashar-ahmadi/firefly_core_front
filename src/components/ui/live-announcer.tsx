'use client'

import { useSyncExternalStore } from 'react'

// One polite live region for the whole shop (in ShopShell), on the page from the first paint:
// a message put into it is read out, whatever else has loaded (Sonner's own region is created
// with the first toast, which a screen reader can miss).

/** The region is emptied first and filled after this, so the same sentence twice is read twice. */
const REFILL_MS = 100

let message = ''
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function show(next: string) {
  message = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reads `text` out politely through the shop's live region (`LiveAnnouncer`). */
export function announce(text: string): void {
  clearTimeout(timer)
  show('')
  timer = setTimeout(() => show(text), REFILL_MS)
}

/** The visually hidden polite region `announce` writes into. Mount it once, in the shell. */
export function LiveAnnouncer() {
  const text = useSyncExternalStore(
    subscribe,
    () => message,
    () => '',
  )
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {text}
    </div>
  )
}
