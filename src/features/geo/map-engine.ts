import type * as LeafletModule from 'leaflet'
import type { MapView } from './coordinates'
import { NESHAN_MAPTYPE, OSM_TILES, tileErrorBurst, type MapTiles } from './tile-config'

// The Leaflet side of the map picker, loaded with the map's chunk only: which Leaflet build, and
// the map it draws. Plain Leaflet for OpenStreetMap; Neshan's SDK (a Leaflet build that draws
// Neshan's layers from the key) for a Neshan store, so a store downloads one of the two.

export type Leaflet = typeof LeafletModule
export type LeafletMap = LeafletModule.Map

/** The SDK's options on top of Leaflet's. */
interface NeshanOptions {
  key: string
  maptype: string
  poi: boolean
  traffic: boolean
}

/** A module's Leaflet, through the CommonJS/UMD `default` wrappers bundlers add. */
function leafletOf(module: unknown): Leaflet {
  let value = module
  for (let depth = 0; depth < 3; depth++) {
    if (typeof value !== 'object' || value === null) break
    // `in` first: a module namespace has no other way to say an export is missing.
    if ('Map' in value && typeof value.Map === 'function') return value as Leaflet
    value = 'default' in value ? value.default : undefined
  }
  throw new Error('The map library did not load.')
}

/** The Leaflet build for `tiles`; rejects when its chunk cannot be downloaded. */
export async function loadLeaflet(tiles: MapTiles): Promise<Leaflet> {
  return leafletOf(
    tiles.provider === 'neshan'
      ? await import('@neshan-maps-platform/leaflet')
      : await import('leaflet'),
  )
}

export interface PickerMapOptions {
  tiles: MapTiles
  view: MapView
  /** The visitor asked for less motion: no zoom, fade or inertia animation. */
  reducedMotion: boolean
  /** Neshan's tiles failed: the map shows OpenStreetMap's from then on. */
  onTilesFallback?: () => void
}

function addOsm(L: Leaflet, map: LeafletMap): void {
  L.tileLayer(OSM_TILES.url, {
    attribution: OSM_TILES.attribution,
    maxZoom: OSM_TILES.maxZoom,
  }).addTo(map)
}

const isTileLayer = (layer: LeafletModule.Layer): layer is LeafletModule.TileLayer =>
  'getTileUrl' in layer

/**
 * The picker's map in `element`: no Leaflet zoom control (the picker draws 44px buttons), arrow
 * keys pan and +/− zoom (Leaflet's keyboard handler makes the container focusable), and the
 * provider's attribution without Leaflet's prefix. On a Neshan map, a burst of failed tiles (a
 * blocked or unpaid key) swaps every tile layer for OpenStreetMap's.
 */
export function createPickerMap(
  L: Leaflet,
  element: HTMLElement,
  { tiles, view, reducedMotion, onTilesFallback }: PickerMapOptions,
): LeafletMap {
  const motion = !reducedMotion
  const options: LeafletModule.MapOptions & Partial<NeshanOptions> = {
    center: [view.centre.latitude, view.centre.longitude],
    zoom: view.zoom,
    minZoom: 5,
    maxZoom: OSM_TILES.maxZoom,
    zoomControl: false,
    attributionControl: true,
    keyboard: true,
    keyboardPanDelta: 100,
    zoomAnimation: motion,
    fadeAnimation: motion,
    markerZoomAnimation: motion,
    inertia: motion,
    ...(tiles.provider === 'neshan' && {
      key: tiles.key,
      maptype: NESHAN_MAPTYPE,
      poi: true,
      traffic: false,
    }),
  }
  const map = new L.Map(element, options)
  map.attributionControl.setPrefix(false)
  if (tiles.provider === 'osm') {
    addOsm(L, map)
    return map
  }

  const failed = tileErrorBurst()
  const onTileError = () => {
    if (!failed(Date.now())) return
    map.eachLayer((layer) => {
      if (isTileLayer(layer)) map.removeLayer(layer)
    })
    addOsm(L, map)
    onTilesFallback?.()
  }
  // The SDK's layers are on the map already; any it adds later are watched too.
  map.eachLayer((layer) => {
    if (isTileLayer(layer)) layer.on('tileerror', onTileError)
  })
  map.on('layeradd', ({ layer }) => {
    if (isTileLayer(layer)) layer.on('tileerror', onTileError)
  })
  return map
}
