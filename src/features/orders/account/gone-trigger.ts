'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'

// A button whose action, once done, takes the button away (order digest §6.1: «لغو سفارش» after
// a cancellation, «پرداخت»/«تأیید سفارش» after a payment or a confirmation from the pay sheet).
// The focus must not fall to <body> with it: it goes to a fallback («خرید دوباره», always there)
// when the button goes while it holds the focus (the order read again after the overlay gave the
// focus back: `useFocusWhenGone`), and when the overlay it opened closes after it went (read
// again meanwhile: `focusInsteadOfGone`, the overlay's `onCloseAutoFocus`).

const focusLost = () => !document.activeElement || document.activeElement === document.body

/** An overlay closes: its `opener` gone, the focus goes to `fallback` instead of <body>. */
export function focusInsteadOfGone(
  event: Event,
  opener: HTMLElement | null,
  fallback: HTMLElement | null,
): void {
  if (opener?.isConnected || !fallback) return
  event.preventDefault()
  fallback.focus()
}

/** The button shown while `present` went, and the focus with it: to `fallback`. */
export function useFocusWhenGone(present: boolean, fallback: RefObject<HTMLElement | null>): void {
  const shown = useRef(present)
  useLayoutEffect(() => {
    const went = shown.current && !present
    shown.current = present
    if (went && focusLost()) fallback.current?.focus()
  }, [present, fallback])
}
