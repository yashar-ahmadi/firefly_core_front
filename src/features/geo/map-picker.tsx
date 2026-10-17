'use client'

// Leaflet's own styles come with the map's chunk only, never with the page.
import 'leaflet/dist/leaflet.css'
import { LocateFixed, Minus, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/icon-button'
import { Spinner } from '@/components/ui/spinner'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { DEFAULT_VIEW, STREET_ZOOM, toGeoPoint, type GeoPoint, type MapView } from './coordinates'
import { locate } from './geolocate'
import { createPickerMap, loadLeaflet, type LeafletMap } from './map-engine'
import { MapUnavailable } from './map-unavailable'
import { provinceView } from './province-centres'
import { mapTiles } from './tile-config'

export interface MapPickerProps {
  /** The saved point: the map opens on it. */
  initial: GeoPoint | null
  /** The chosen province's name: without a saved point, the map opens on its capital. */
  provinceName?: string
  onConfirm: (point: GeoPoint) => void
  onCancel: () => void
}

const OSM_ONLY = { provider: 'osm', neshanKey: null } as const
const FOUND = 'نقشه روی موقعیت شما رفت؛ اگر لازم است آن را جابه‌جا کنید.'
const OVERLAY_BUTTON =
  'border border-ink-300 bg-white shadow-card hover:bg-ink-50 aria-disabled:opacity-50'

function startView(initial: GeoPoint | null, provinceName: string | undefined): MapView {
  if (initial) return { centre: initial, zoom: STREET_ZOOM }
  return provinceView(provinceName) ?? DEFAULT_VIEW
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The pin: fixed at the centre, its tip on the point; it lifts while the map moves. */
function CentrePin({ lifted }: { lifted: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-950/40" />
      <svg
        viewBox="0 0 40 52"
        className={cn(
          'absolute top-1/2 left-1/2 h-13 w-10 -translate-x-1/2 -translate-y-full text-brand drop-shadow-md',
          'motion-safe:transition-transform motion-safe:duration-150',
          lifted && 'motion-safe:-translate-y-[calc(100%+0.5rem)]',
        )}
      >
        <path
          fill="currentColor"
          d="M20 0C9 0 0 8.7 0 19.6 0 33.7 17.4 49.6 18.2 50.3a2.7 2.7 0 0 0 3.6 0C22.6 49.6 40 33.7 40 19.6 40 8.7 31 0 20 0Z"
        />
        <circle cx="20" cy="19.5" r="7" fill="white" />
      </svg>
    </div>
  )
}

/**
 * The location picker: the visitor pans the map under a fixed pin (the familiar pattern of
 * Iranian delivery apps), then «تأیید موقعیت» answers the point under it, rounded to 6
 * decimals. The map is left-to-right inside the RTL page, so Leaflet lays out as it expects.
 * «موقعیت من» asks the browser only when pressed. If Leaflet cannot load, the picker says so
 * and the form goes on without a location.
 */
export function MapPicker({ initial, provinceName, onConfirm, onCancel }: MapPickerProps) {
  const config = useOptionalStoreConfig()
  // Fixed for the picker's life: the map is set up once.
  const [setup] = useState(() => ({
    tiles: mapTiles(config?.map ?? OSM_ONLY),
    view: startView(initial, provinceName),
  }))
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [point, setPoint] = useState(() =>
    toGeoPoint(setup.view.centre.latitude, setup.view.centre.longitude),
  )
  const [moving, setMoving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState('')
  const hintId = useId()

  useEffect(() => {
    const element = container.current
    if (!element) return
    let gone = false
    let created: LeafletMap | null = null
    loadLeaflet(setup.tiles)
      .then((L) => {
        if (gone) return
        const view = createPickerMap(L, element, {
          ...setup,
          reducedMotion: prefersReducedMotion(),
        })
        created = view
        view.on('movestart', () => setMoving(true))
        view.on('moveend', () => {
          const centre = view.getCenter().wrap()
          setMoving(false)
          setPoint(toGeoPoint(centre.lat, centre.lng))
        })
        map.current = view
        setStatus('ready')
      })
      .catch(() => {
        if (!gone) setStatus('failed')
      })
    return () => {
      gone = true
      created?.remove()
      map.current = null
    }
  }, [setup])

  const ready = status === 'ready'
  // The overlay buttons wait for the map (focusable, said unavailable, inert).
  const waiting = { 'aria-disabled': !ready || undefined }

  async function findMe() {
    if (locating || !ready) return
    setLocating(true)
    setMessage('')
    const result = await locate()
    setLocating(false)
    if (!result.ok) return setMessage(result.message)
    // Only a move that happened is announced (the map may have gone meanwhile).
    const view = map.current
    if (!view) return
    const { latitude, longitude } = result.point
    view.setView([latitude, longitude], STREET_ZOOM, { animate: !prefersReducedMotion() })
    setMessage(FOUND)
  }

  if (status === 'failed') return <MapUnavailable onCancel={onCancel} />

  return (
    <div className="flex flex-col gap-3">
      {/* Dragging the map never drags the bottom sheet around it. Its layers (Leaflet's panes,
          the pin, the buttons) stack inside it, under the sheet's pinned save button. */}
      <div
        data-vaul-no-drag=""
        className="relative isolate h-72 overflow-hidden rounded-control border border-ink-300 bg-ink-100 md:h-80"
      >
        <div
          ref={container}
          dir="ltr"
          role="application"
          aria-label="نقشه"
          aria-describedby={hintId}
          className="absolute inset-0 z-0 focus-visible:ring-4 focus-visible:ring-(--focus) focus-visible:outline-none focus-visible:ring-inset"
        />
        <CentrePin lifted={moving} />
        {status === 'loading' && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-ink-50/80">
            <Spinner size="lg" label="در حال بارگذاری نقشه" className="text-brand-600" />
          </div>
        )}
        <div className="absolute top-2 left-2 z-20 flex flex-col gap-2">
          <IconButton
            label="بزرگ‌نمایی"
            icon={<Plus />}
            className={OVERLAY_BUTTON}
            {...waiting}
            onClick={() => map.current?.zoomIn()}
          />
          <IconButton
            label="کوچک‌نمایی"
            icon={<Minus />}
            className={OVERLAY_BUTTON}
            {...waiting}
            onClick={() => map.current?.zoomOut()}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className={cn('absolute bottom-7 left-2 z-20', OVERLAY_BUTTON)}
          loading={locating}
          iconStart={<LocateFixed aria-hidden />}
          {...waiting}
          onClick={() => void findMe()}
        >
          موقعیت من
        </Button>
      </div>
      <p id={hintId} className="text-sm leading-6 text-ink-600">
        نقشه را جابه‌جا کنید تا نشانگر روی در ورودی ساختمان بایستد. با کلیدهای جهت‌نما و + و − هم
        می‌شود نقشه را جابه‌جا و بزرگ یا کوچک کرد.
      </p>
      <p role="status" className="text-sm leading-6 text-ink-700 empty:hidden">
        {message}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={status !== 'ready'} onClick={() => onConfirm(point)}>
          تأیید موقعیت
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          انصراف
        </Button>
      </div>
    </div>
  )
}
