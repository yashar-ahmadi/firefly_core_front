'use client'

import { MapPinOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

export const MAP_UNAVAILABLE = 'نقشه بارگذاری نشد؛ می‌توانید بدون نقشه ادامه دهید.'

/**
 * Whether the focus is still where the picker had it: on its region (`data-map-region`, from
 * `LocationField`: it holds the focus while the map loads) or inside it, or on the page's body
 * (the focused map went). Elsewhere, the visitor moved on while the map loaded.
 */
function focusStayed(root: HTMLElement): boolean {
  const active = root.ownerDocument.activeElement
  if (!active || active === root.ownerDocument.body) return true
  const region = root.closest('[data-map-region]') ?? root
  return region.contains(active)
}

/**
 * In place of the map when its code or its library cannot be downloaded (a stale chunk after a
 * deploy, a dropped connection): the location is optional, so the form goes on without it. What
 * had the focus (the map's region) is gone or useless: «بستن نقشه» takes it, unless the visitor
 * has moved on to another field meanwhile (a slow failure).
 */
export function MapUnavailable({ onCancel }: { onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (root.current && focusStayed(root.current)) close.current?.focus()
  }, [])
  return (
    <div
      ref={root}
      role="alert"
      className="flex flex-col items-start gap-3 rounded-control bg-ink-50 px-4 py-3 text-base text-ink-700"
    >
      <p className="flex items-start gap-2 leading-7">
        <MapPinOff aria-hidden className="mt-1 size-5 shrink-0 text-ink-500" />
        {MAP_UNAVAILABLE}
      </p>
      <Button ref={close} variant="outline" size="sm" onClick={onCancel}>
        بستن نقشه
      </Button>
    </div>
  )
}
