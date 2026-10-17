import type { PublicStoreConfig } from '@/config/resolve-store-config'

// Which map tiles a store shows (store config `map`: Neshan when keyed, else OpenStreetMap), and
// when Neshan's tiles count as down. Pure.
//
// Neshan has no plain tile URL to put in a Leaflet tile layer: its tile paths are computed by
// its SDK (`@neshan-maps-platform/leaflet`, a Leaflet build), which also reports each map load to
// Neshan with the key (`Api-Key`). So a Neshan store maps with that SDK, everything else with
// plain Leaflet and the standard OpenStreetMap layer.

export type MapTiles = { provider: 'osm' } | { provider: 'neshan'; key: string }

/** The standard OpenStreetMap layer; its usage policy requires the attribution on the map. */
export const OSM_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19,
} as const

/** Neshan's own street map style. */
export const NESHAN_MAPTYPE = 'neshan'

export function mapTiles(map: PublicStoreConfig['map']): MapTiles {
  const key = map.neshanKey?.trim()
  return map.provider === 'neshan' && key ? { provider: 'neshan', key } : { provider: 'osm' }
}

/**
 * Counts failed tiles: true once `limit` fail within `windowMs` (a blocked or unpaid provider,
 * not a tile lost now and then), then never again (the map has switched by then).
 */
export function tileErrorBurst({ limit = 6, windowMs = 5000 } = {}): (now: number) => boolean {
  let failures: number[] = []
  let reported = false
  return (now) => {
    if (reported) return false
    failures = [...failures.filter((at) => now - at < windowMs), now]
    if (failures.length < limit) return false
    reported = true
    return true
  }
}
