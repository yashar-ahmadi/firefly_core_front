'use client'

import { MapPinOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

export const MAP_UNAVAILABLE = 'نقشه بارگذاری نشد؛ می‌توانید بدون نقشه ادامه دهید.'

/**
 * In place of the map when its code or its library cannot be downloaded (a stale chunk after a
 * deploy, a dropped connection): the location is optional, so the form goes on without it. What
 * had the focus (the map's region) is gone or useless: «بستن نقشه» takes it.
 */
export function MapUnavailable({ onCancel }: { onCancel: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => close.current?.focus(), [])
  return (
    <div
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
