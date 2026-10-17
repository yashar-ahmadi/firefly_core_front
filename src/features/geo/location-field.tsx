'use client'

import { MapPin, MapPinned, Trash2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { GeoPoint } from './coordinates'
import type { MapPickerProps } from './map-picker'
import { MapUnavailable } from './map-unavailable'

// The map (its code, Leaflet and the tiles) loads only when the visitor asks for it, or as the
// pointer or the focus reaches the button: never with the page (the JS budget, P2-R4). A failed
// download says so in place, and the form goes on without a location.
const MapPicker = dynamic<MapPickerProps>(
  () => import('./map-picker').then((module) => module.MapPicker).catch(() => MapUnavailable),
  { ssr: false, loading: MapLoading },
)
/** A failed preload is dropped: opening the map tries again. */
const preloadMap = () => {
  import('./map-picker').catch(() => {})
}

function MapLoading() {
  return (
    <div className="grid h-72 place-items-center rounded-control bg-ink-50 md:h-80">
      <Spinner size="lg" label="در حال بارگذاری نقشه" className="text-brand-600" />
    </div>
  )
}

export interface LocationFieldProps {
  /** Both coordinates, or null: never one of them. */
  value: GeoPoint | null
  onChange: (value: GeoPoint | null) => void
  /** The chosen province: the map opens on its capital when there is no point yet. */
  provinceName?: string
  /** The API's messages about the coordinates. */
  errors?: readonly string[]
}

/**
 * «موقعیت روی نقشه» (optional): «انتخاب موقعیت روی نقشه» opens the picker in place; with a
 * point, «تغییر موقعیت» and «حذف موقعیت». The focus comes back to the block's first button when
 * the picker closes or the point goes.
 */
export function LocationField({ value, onChange, provinceName, errors = [] }: LocationFieldProps) {
  const [open, setOpen] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const labelId = useId()
  const stateId = useId()
  const errorId = useId()

  useEffect(() => {
    if (!refocus.current || open) return
    refocus.current = false
    primary.current?.focus()
  })

  function close(next?: GeoPoint | null) {
    if (next !== undefined) onChange(next)
    refocus.current = true
    setOpen(false)
  }

  const described = errors.length > 0 ? `${stateId} ${errorId}` : stateId
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <p id={labelId} className="text-base font-medium text-ink-800">
        موقعیت روی نقشه <span className="font-normal text-ink-600">(اختیاری)</span>
      </p>
      {open ? (
        <MapPicker
          initial={value}
          provinceName={provinceName}
          onConfirm={(point) => close(point)}
          onCancel={() => close()}
        />
      ) : (
        <>
          <p id={stateId} className="flex items-start gap-2 text-base leading-7 text-ink-700">
            <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-ink-500" />
            {value ? 'موقعیت روی نقشه انتخاب شده است.' : 'موقعیتی روی نقشه انتخاب نشده است.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              ref={primary}
              variant="outline"
              iconStart={<MapPinned aria-hidden />}
              aria-describedby={described}
              onPointerEnter={preloadMap}
              onFocus={preloadMap}
              onClick={() => setOpen(true)}
            >
              {value ? 'تغییر موقعیت' : 'انتخاب موقعیت روی نقشه'}
            </Button>
            {value && (
              <Button
                variant="ghost"
                className="text-danger"
                iconStart={<Trash2 aria-hidden />}
                onClick={() => close(null)}
              >
                حذف موقعیت
              </Button>
            )}
          </div>
        </>
      )}
      {errors.length > 0 && (
        <ul id={errorId} className="text-sm leading-6 font-medium text-danger">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
