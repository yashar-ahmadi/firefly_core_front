'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { keepOrderCode, releaseOrderCode, takeOrderCode } from './track-handoff'

const noSubscription = () => () => {}

/**
 * The order code another page handed to tracking (track-handoff.ts), '' when none, taken once:
 * the handoff is cleared as the page reads it, and forgotten when the page goes. A page the
 * server rendered starts empty as its HTML did (no hydration mismatch) and has it in the render
 * right after: key the form on it, so its state starts from it.
 */
export function useHandedOrderCode(): string {
  const ownRender = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  )
  const code = ownRender ? takeOrderCode() : ''
  useEffect(() => {
    keepOrderCode(code)
    return () => releaseOrderCode()
  }, [code])
  return code
}
